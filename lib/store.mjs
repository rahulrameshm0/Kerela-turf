export class FirestoreStore {
  constructor(db){this.db=db}
  async get(c,id){const d=await this.db.collection(c).doc(id).get();return d.exists?d.data():null}
  async list(c,filters=[]){let q=this.db.collection(c);for(const [f,op,v] of filters)q=q.where(f,op,v);return (await q.get()).docs.map(d=>d.data())}
  async set(c,id,value){await this.db.collection(c).doc(id).set(value)}
  async transaction(fn){return this.db.runTransaction(async t=>fn({get:async(c,id)=>{const d=await t.get(this.db.collection(c).doc(id));return d.exists?d.data():null},list:async(c,filters=[])=>{let q=this.db.collection(c);for(const [f,op,v] of filters)q=q.where(f,op,v);return (await t.get(q)).docs.map(d=>d.data())},set:(c,id,data)=>t.set(this.db.collection(c).doc(id),data)}))}
}
