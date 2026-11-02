import {Marketplace} from '../lib/marketplace.mjs';
import {readConfig} from '../lib/config.mjs';
// Test-only store: serializable transactions, rollback, and Firestore's read-before-write rule.
export class MemoryStore {
  constructor(){this.data=new Map();this.queue=Promise.resolve()}
  async get(c,id){return structuredClone(this.data.get(c+'/'+id)||null)}
  async list(c,filters=[]){return [...this.data.entries()].filter(([k])=>k.startsWith(c+'/')).map(([,v])=>structuredClone(v)).filter(v=>filters.every(([f,op,val])=>op==='=='&&v[f]===val))}
  async set(c,id,data){this.data.set(c+'/'+id,structuredClone(data))}
  async transaction(fn){let release;const prior=this.queue;this.queue=new Promise(r=>release=r);await prior;const staged=new Map();let writing=false;try{const result=await fn({get:async(c,id)=>{if(writing)throw new Error('Firestore reads must precede writes');return this.get(c,id)},list:async(c,f)=>{if(writing)throw new Error('Firestore reads must precede writes');return this.list(c,f)},set:(c,id,data)=>{writing=true;staged.set(c+'/'+id,structuredClone(data))}});for(const [k,v]of staged)this.data.set(k,v);return result}finally{release()}}
}
export class FakeGateway {
  constructor(){this.orderSeq=0;this.refundSeq=0;this.paymentMap=new Map();this.refundMap=new Map();this.refundMode='processed';this.refundCalls=0}
  async createOrder(amount,receipt){return {id:'order_'+ ++this.orderSeq,amount,receipt}}
  async payment(id){return this.paymentMap.get(id)}
  async payments(order){return {items:[...this.paymentMap.values()].filter(p=>p.order_id===order)}}
  async refund(payment,amount,receipt){this.refundCalls++;if(this.refundMode==='timeout')throw new Error('network timeout');const r={id:'rfnd_'+ ++this.refundSeq,payment_id:payment,amount,receipt,status:this.refundMode};this.refundMap.set(r.id,r);return r}
  async refunds(payment){return {items:[...this.refundMap.values()].filter(r=>r.payment_id===payment)}}
}
export async function fixture(){const store=new MemoryStore(),gateway=new FakeGateway(),now={value:Date.parse('2027-01-01T00:00:00Z')};const config=readConfig({RAZORPAY_KEY_ID:'rzp_test_fixture',RAZORPAY_KEY_SECRET:'test_secret',RAZORPAY_WEBHOOK_SECRET:'webhook_secret'});const market=new Marketplace(store,gateway,config,()=>now.value);const admin={id:'admin',role:'admin',name:'Admin',verifiedPhone:'+919000000001'},alice={id:'alice',role:'user',name:'Alice',verifiedPhone:'+919000000002'},bob={id:'bob',role:'user',name:'Bob',verifiedPhone:'+919000000003'};
  const turf=await market.saveTurf(admin,null,{name:'Test-only ground',town:'Kochi',district:'Ernakulam',address:'Test address',lat:9.98,lng:76.3,formats:[7],surface:'Artificial grass',price:1200,slotDuration:60,cutoffHours:2,refundPercent:100,published:true});
  await market.publishSlots(admin,turf.id,{from:'2027-01-03',to:'2027-01-03',open:'08:00',close:'13:00'});const slots=(await store.list('slots')).sort((a,b)=>a.start-b.start);return {store,gateway,market,config,now,admin,alice,bob,turf,slots};
}
export async function pay(f,booking,user=f.alice){const order=await f.market.order(user,booking.id);const payment={id:'pay_'+booking.id.replaceAll('-',''),order_id:order.orderId,amount:order.amount,currency:'INR',method:'upi',status:'captured'};f.gateway.paymentMap.set(payment.id,payment);await f.market.settlePayment(payment);return f.store.get('bookings',booking.id)}
