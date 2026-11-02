import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {FirestoreStore} from '../lib/store.mjs';
import {Marketplace} from '../lib/marketplace.mjs';
import {FakeGateway} from './helpers.mjs';
import {readConfig} from '../lib/config.mjs';

test('Firestore emulator: transaction contention allows one slot claim',{skip:!process.env.FIRESTORE_EMULATOR_HOST},async()=>{
  const app=initializeApp({projectId:'demo-turfkerala'},'test-'+randomUUID()),db=getFirestore(app);const store=new FirestoreStore(db),market=new Marketplace(store,new FakeGateway(),readConfig({}));
  const id='test-'+randomUUID(),slotId=id+'_slot',now=Date.now();
  await store.set('turfs',id,{id,name:'Test fixture only',published:true,active:true,cutoffHours:2,refundPercent:100});
  await store.set('slots',slotId,{id:slotId,turfId:id,date:'2099-01-01',start:now+86400000,end:now+90000000,price:120000,published:true,blocked:false,holdId:null,holdUntil:0,bookingId:null});
  try{const results=await Promise.allSettled(['a','b'].map(user=>market.hold({id:user,name:user,verifiedPhone:'',role:'user'},slotId)));assert.equal(results.filter(r=>r.status==='fulfilled').length,1)}finally{const bookings=await store.list('bookings',[['turfId','==',id]]);await Promise.all([db.doc('turfs/'+id).delete(),db.doc('slots/'+slotId).delete(),...bookings.map(b=>db.doc('bookings/'+b.id).delete())]);await deleteApp(app)}
});
