import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {fixture,pay} from './helpers.mjs';
import {validSignature} from '../lib/razorpay.mjs';
import {readConfig} from '../lib/config.mjs';
import {distanceKm,dateValid} from '../lib/common.mjs';

test('two customers racing a slot create exactly one hold',async()=>{const f=await fixture();const result=await Promise.allSettled([f.market.hold(f.alice,f.slots[0].id),f.market.hold(f.bob,f.slots[0].id)]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);const error=result.find(r=>r.status==='rejected').reason;assert.equal(error.code,'SLOT_CONFLICT');assert.equal(error.message,'This turf was just booked');assert.ok(error.details.alternatives.length);assert.equal((await f.store.list('bookings')).length,1)});
test('repeated hold by the same customer is idempotent',async()=>{const f=await fixture();const a=await f.market.hold(f.alice,f.slots[0].id);const b=await f.market.hold(f.alice,f.slots[0].id);assert.equal(a.id,b.id)});
test('expired holds are reclaimable and late captures refund without stealing the slot',async()=>{const f=await fixture();const a=await f.market.hold(f.alice,f.slots[0].id);const order=await f.market.order(f.alice,a.id);f.now.value+=600001;const b=await f.market.hold(f.bob,f.slots[0].id);const p={id:'pay_late',order_id:order.orderId,amount:order.amount,currency:'INR',status:'captured'};await f.market.settlePayment(p);assert.equal((await f.store.get('slots',f.slots[0].id)).holdId,b.id);assert.equal((await f.store.get('bookings',a.id)).status,'refunded');assert.equal(f.gateway.refundCalls,1);await f.market.settlePayment(p);assert.equal(f.gateway.refundCalls,1)});
test('invalid signatures, amount tampering and ownership violations are rejected',async()=>{const f=await fixture();const b=await f.market.hold(f.alice,f.slots[0].id);const o=await f.market.order(f.alice,b.id);await assert.rejects(f.market.booking(f.bob,b.id),{code:'FORBIDDEN'});await assert.rejects(f.market.cancel(f.bob,b.id),{code:'FORBIDDEN'});await assert.rejects(f.market.verifyPayment(f.alice,b.id,{razorpay_order_id:o.orderId,razorpay_payment_id:'pay_1',razorpay_signature:'invalid'}),{code:'INVALID_SIGNATURE'});await assert.rejects(f.market.settlePayment({id:'pay_1',order_id:o.orderId,currency:'INR',amount:1,status:'captured'}),{code:'PAYMENT_MISMATCH'});assert.equal((await f.store.get('bookings',b.id)).status,'payment_pending')});
test('verified captured payment confirms once and out-of-order failures do not downgrade it',async()=>{const f=await fixture();const b=await f.market.hold(f.alice,f.slots[0].id),o=await f.market.order(f.alice,b.id);const p={id:'pay_verified',order_id:o.orderId,amount:o.amount,currency:'INR',method:'card',status:'captured'};f.gateway.paymentMap.set(p.id,p);const signature=createHmac('sha256',f.config.razorpay.secret).update(`${o.orderId}|${p.id}`).digest('hex');await f.market.verifyPayment(f.alice,b.id,{razorpay_order_id:o.orderId,razorpay_payment_id:p.id,razorpay_signature:signature});await f.market.settlePayment({...p,status:'failed'});assert.equal((await f.store.get('bookings',b.id)).status,'confirmed');assert.equal((await f.store.list('payments')).length,1);assert.equal((await f.store.get('slots',b.slotId)).bookingId,b.id)});
test('signed webhook duplicates are idempotent and invalid webhooks rejected',async()=>{const f=await fixture();const b=await f.market.hold(f.alice,f.slots[0].id),o=await f.market.order(f.alice,b.id);const p={id:'pay_hook',order_id:o.orderId,amount:o.amount,currency:'INR',status:'captured'};f.gateway.paymentMap.set(p.id,p);const raw=Buffer.from(JSON.stringify({event:'payment.captured',payload:{payment:{entity:p}}}));const sig=createHmac('sha256',f.config.razorpay.webhookSecret).update(raw).digest('hex');await assert.rejects(f.market.webhook(raw,'bad','event1'),{code:'INVALID_SIGNATURE'});await f.market.webhook(raw,sig,'event1');assert.deepEqual(await f.market.webhook(raw,sig,'event1'),{duplicate:true});assert.equal((await f.store.get('bookings',b.id)).status,'confirmed')});
test('cancellation releases slot, preserves audit, and refunds only once',async()=>{const f=await fixture();const b=await pay(f,await f.market.hold(f.alice,f.slots[0].id));await f.market.cancel(f.alice,b.id);await f.market.cancel(f.alice,b.id);const current=await f.store.get('bookings',b.id);assert.equal(current.status,'refunded');assert.ok(current.audit.some(a=>a.action==='cancelled'));assert.equal((await f.store.get('slots',b.slotId)).bookingId,null);assert.equal(f.gateway.refundCalls,1)});
test('cutoff prevents cancellation and rescheduling; admin can cancel',async()=>{const f=await fixture();const b=await pay(f,await f.market.hold(f.alice,f.slots[0].id));f.now.value=b.start-3600000;await assert.rejects(f.market.cancel(f.alice,b.id),{code:'CUTOFF_PASSED'});await assert.rejects(f.market.hold(f.alice,f.slots[1].id,b.id),{code:'CUTOFF_PASSED'});await f.market.cancel(f.admin,b.id);assert.equal((await f.store.get('bookings',b.id)).status,'refunded')});
test('same-price reschedule atomically swaps slots and leaves an audit record',async()=>{const f=await fixture();const old=await pay(f,await f.market.hold(f.alice,f.slots[0].id));const next=await f.market.hold(f.alice,f.slots[1].id,old.id);assert.equal((await f.store.get('slots',old.slotId)).bookingId,old.id);await f.market.order(f.alice,next.id);assert.equal((await f.store.get('bookings',next.id)).status,'confirmed');assert.equal((await f.store.get('slots',old.slotId)).bookingId,null);assert.equal((await f.store.get('bookings',old.id)).cancelReason,'rescheduled')});
test('price increase collects difference and keeps old game when payment fails',async()=>{const f=await fixture();const old=await pay(f,await f.market.hold(f.alice,f.slots[0].id));await f.store.set('slots',f.slots[1].id,{...f.slots[1],price:150000});const next=await f.market.hold(f.alice,f.slots[1].id,old.id),o=await f.market.order(f.alice,next.id);assert.equal(o.amount,30000);await f.market.settlePayment({id:'pay_failed',order_id:o.orderId,amount:o.amount,currency:'INR',status:'failed'});assert.equal((await f.store.get('bookings',old.id)).status,'confirmed');await pay(f,next);assert.equal((await f.store.get('bookings',next.id)).paymentIds.length,2);assert.equal((await f.store.get('slots',old.slotId)).bookingId,null);await f.market.cancel(f.alice,next.id);const refunds=await f.store.list('refunds');assert.equal(refunds.reduce((sum,r)=>sum+r.amount,0),150000)});
test('price decrease waits for verified partial refund before swapping slots',async()=>{const f=await fixture();const old=await pay(f,await f.market.hold(f.alice,f.slots[0].id));await f.store.set('slots',f.slots[1].id,{...f.slots[1],price:90000});f.gateway.refundMode='pending';const next=await f.market.hold(f.alice,f.slots[1].id,old.id);await f.market.order(f.alice,next.id);assert.equal((await f.store.get('bookings',old.id)).status,'confirmed');assert.equal((await f.store.get('bookings',next.id)).status,'refund_pending');const r=(await f.store.list('refunds'))[0],g=[...f.gateway.refundMap.values()][0];assert.equal(r.amount,30000);await f.market.applyRefund(r.id,{...g,status:'processed'});await f.market.applyRefund(r.id,{...g,status:'processed'});assert.equal((await f.store.get('bookings',next.id)).status,'confirmed');assert.equal((await f.store.get('slots',old.slotId)).bookingId,null);assert.equal((await f.store.list('payments'))[0].refunded,30000)});
test('failed partial refund rolls back reschedule, preserving original booking',async()=>{const f=await fixture();const old=await pay(f,await f.market.hold(f.alice,f.slots[0].id));await f.store.set('slots',f.slots[1].id,{...f.slots[1],price:90000});f.gateway.refundMode='failed';const next=await f.market.hold(f.alice,f.slots[1].id,old.id);await f.market.order(f.alice,next.id);assert.equal((await f.store.get('bookings',old.id)).status,'confirmed');assert.equal((await f.store.get('bookings',old.id)).pendingChange,null);assert.equal((await f.store.get('slots',next.slotId)).bookingId,null);assert.equal((await f.store.get('bookings',next.id)).status,'cancelled')});
test('uncertain refund is not submitted twice and remains visible for reconciliation',async()=>{const f=await fixture();const b=await pay(f,await f.market.hold(f.alice,f.slots[0].id));f.gateway.refundMode='timeout';await f.market.cancel(f.alice,b.id);await Promise.all([f.market.processRefunds(b.id),f.market.processRefunds(b.id)]);assert.equal(f.gateway.refundCalls,1);assert.equal((await f.store.list('refunds'))[0].status,'needs_review');assert.equal((await f.store.get('bookings',b.id)).status,'refund_pending')});
test('unpublished, blocked and overlapping slots cannot be booked or duplicated',async()=>{const f=await fixture();await assert.rejects(f.market.saveTurf(f.alice,null,{}),{code:'ADMIN_REQUIRED'});await f.market.blockSlots(f.admin,f.turf.id,{slotId:f.slots[0].id,blocked:true});await assert.rejects(f.market.hold(f.alice,f.slots[0].id),{code:'SLOT_CONFLICT'});await f.market.publishSlots(f.admin,f.turf.id,{from:'2027-01-03',to:'2027-01-03',open:'08:30',close:'12:30'});assert.equal((await f.store.list('slots')).length,5);const b=await f.market.hold(f.alice,f.slots[1].id);await assert.rejects(f.market.blockSlots(f.admin,f.turf.id,{date:'2027-01-03'}),{code:'ACTIVE_BOOKINGS'});assert.equal((await f.store.get('slots',b.slotId)).blocked,false)});
test('search respects district, distance and availability; profile never accepts a role or verified phone',async()=>{const f=await fixture();const result=await f.market.search({district:'Ernakulam',date:'2027-01-03',available:'true',lat:'9.98',lng:'76.3'});assert.equal(result.turfs.length,1);assert.equal(result.turfs[0].distance,0);assert.equal((await f.market.search({district:'Kannur'})).turfs.length,0);await f.store.set('users',f.alice.id,f.alice);const user=await f.market.updateProfile(f.alice,{name:'New name',role:'admin',verifiedPhone:'+910000000000'});assert.equal(user.role,'user');assert.equal(user.verifiedPhone,f.alice.verifiedPhone);assert.equal(user.preferredLocation,null)});
test('configuration defaults OTP off and prevents accidental live payment activation',()=>{assert.equal(readConfig({}).phoneEnabled,false);assert.throws(()=>readConfig({RAZORPAY_KEY_ID:'rzp_live_test'}));assert.throws(()=>readConfig({LAUNCH_MODE:'public'}));assert.equal(validSignature('body','a'.repeat(64),'secret'),false);assert.equal(dateValid('2027-02-31'),false);assert.ok(distanceKm({lat:9.98,lng:76.3},{lat:11.25,lng:75.77})>100)});


test('reconciliation expires holds even during a payment-provider outage', async () => {
  const f = await fixture();
  const b = await f.market.hold(f.alice, f.slots[0].id);
  await f.market.order(f.alice, b.id);
  f.now.value += 600001;
  f.gateway.payments = async () => { throw new Error('Provider unavailable'); };
  const result = await f.market.reconcile();
  assert.equal(result.errors, 1);
  assert.equal((await f.store.get('bookings', b.id)).status, 'expired');
  assert.equal((await f.store.get('slots', b.slotId)).holdId, null);
});

test('reconciliation completes an extra-capture refund without cancelling the confirmed booking', async () => {
  const f = await fixture();
  const b = await pay(f, await f.market.hold(f.alice, f.slots[0].id));
  f.gateway.refundMode = 'pending';
  await f.market.settlePayment({id:'pay_extra', order_id:b.orderId, amount:b.amountDue, currency:'INR', status:'captured'});
  const refund = [...f.gateway.refundMap.values()][0];
  f.gateway.refundMap.set(refund.id, {...refund, status:'processed'});
  await f.market.reconcile();
  assert.equal((await f.store.list('refunds'))[0].status, 'processed');
  assert.equal((await f.store.get('bookings', b.id)).status, 'confirmed');
  assert.equal((await f.store.get('slots', b.slotId)).bookingId, b.id);
  assert.equal(f.gateway.refundCalls, 1);
});

test('blocked dates persist before slots exist and prevent later publication', async () => {
  const f = await fixture();
  const date = '2027-01-04';
  const result = await f.market.blockSlots(f.admin, f.turf.id, {date, blocked:true});
  assert.equal(result.updated, 0);
  assert.equal(result.dateBlocked, true);
  const range = {from:date, to:date, open:'08:00', close:'10:00'};
  assert.deepEqual(await f.market.publishSlots(f.admin, f.turf.id, range), {created:0, skipped:2});
  assert.equal((await f.market.dashboard(f.admin)).blockedDates[0].date, date);
  await f.market.blockSlots(f.admin, f.turf.id, {date, blocked:false});
  assert.deepEqual(await f.market.publishSlots(f.admin, f.turf.id, range), {created:2, skipped:0});
  assert.equal((await f.market.availability(f.turf.id, date)).slots.length, 2);
});

test('individual slots cannot reopen a blocked day and failed day blocks leave no record', async () => {
  const f = await fixture();
  await f.market.blockSlots(f.admin, f.turf.id, {date:f.slots[0].date});
  await assert.rejects(f.market.blockSlots(f.admin, f.turf.id, {slotId:f.slots[0].id, blocked:false}), {code:'DATE_BLOCKED'});
  await f.market.blockSlots(f.admin, f.turf.id, {date:f.slots[0].date, blocked:false});
  await f.market.hold(f.alice, f.slots[0].id);
  await assert.rejects(f.market.blockSlots(f.admin, f.turf.id, {date:f.slots[0].date}), {code:'ACTIVE_BOOKINGS'});
  assert.equal((await f.market.dashboard(f.admin)).blockedDates.length, 0);
});

test('cancelling after a cheaper reschedule preserves both refund records and accounting', async () => {
  const f = await fixture();
  const old = await pay(f, await f.market.hold(f.alice, f.slots[0].id));
  await f.store.set('slots', f.slots[1].id, {...f.slots[1], price:90000});
  const next = await f.market.hold(f.alice, f.slots[1].id, old.id);
  await f.market.order(f.alice, next.id);
  const originalRefund = (await f.store.list('refunds'))[0];
  await f.market.cancel(f.alice, next.id);
  const refunds = await f.store.list('refunds');
  assert.equal(refunds.length, 2);
  assert.deepEqual(await f.store.get('refunds', originalRefund.id), originalRefund);
  assert.equal(refunds.reduce((total,r) => total+r.amount, 0), old.price);
  const payment = await f.store.get('payments', old.paymentIds[0]);
  assert.equal(payment.refunded, old.price);
  assert.equal(payment.reservedRefund, 0);
  assert.equal((await f.store.get('bookings', next.id)).status, 'refunded');
  await f.market.cancel(f.alice, next.id);
  assert.equal(f.gateway.refundCalls, 2);
});

test('slot publication counts only committed transaction attempts', async () => {
  const f = await fixture();
  const transaction = f.store.transaction.bind(f.store);
  let retry = true;
  f.store.transaction = async fn => {
    if (retry) {
      retry = false;
      await assert.rejects(transaction(async tx => { await fn(tx); throw new Error('Retry transaction'); }));
    }
    return transaction(fn);
  };
  assert.deepEqual(await f.market.publishSlots(f.admin, f.turf.id, {from:'2027-01-04',to:'2027-01-04',open:'08:00',close:'10:00'}), {created:2, skipped:0});
});
