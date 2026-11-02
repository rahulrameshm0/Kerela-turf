import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from '../api.mjs';
import {readConfig} from '../lib/config.mjs';
import {MemoryStore,FakeGateway} from './helpers.mjs';

test('HTTP authentication, admin authorization, role tampering, and profile restoration',async()=>{
  const store=new MemoryStore(),config=readConfig({ADMIN_UIDS:'owner'});
  const identities={customer:{uid:'customer',name:'Customer',email:'customer@example.test'},owner:{uid:'owner',name:'Owner',phone_number:'+919000000000'}};
  const server=createServer(config,{store,verify:async token=>{if(!identities[token])throw Object.assign(Error('Invalid token'),{code:'auth/invalid-id-token'});return identities[token]}},new FakeGateway());
  server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  async function api(path,identity,method='GET',body){const r=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',...(identity?{Authorization:'Bearer '+identity}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}
  try{
    assert.equal((await api('/bookings')).status,401);
    assert.equal((await api('/me','expired')).status,401);
    assert.equal((await api('/admin/dashboard','customer')).status,403);
    assert.equal((await api('/admin/turfs','customer','POST',{})).status,403);
    const first=await api('/me','customer');assert.equal(first.data.user.role,'user');assert.equal(first.data.user.id,'customer');
    const update=await api('/profile','customer','PATCH',{name:'Updated',email:'attacker@example.test',role:'admin',verifiedPhone:'+910000000000',preferredLocation:{district:'Ernakulam',town:'Kochi'}});
    assert.equal(update.data.user.role,'user');assert.equal(update.data.user.verifiedPhone,'');assert.equal(update.data.user.email,'customer@example.test');
    const restored=await api('/me','customer');assert.equal(restored.data.user.name,'Updated');assert.equal(restored.data.user.preferredLocation.town,'Kochi');
    assert.equal((await api('/me','owner')).data.user.role,'admin');assert.equal((await api('/admin/dashboard','owner')).status,200);
    const empty=await api('/turfs');assert.deepEqual(empty.data.turfs,[]);
    const publicConfig=await api('/config');assert.equal(publicConfig.data.phoneEnabled,false);assert.equal(publicConfig.data.razorpay,undefined);assert.equal(publicConfig.data.adminUids,undefined);
    assert.equal((await api('/jobs/reconcile',undefined,'POST',{})).status,401);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});

test('admin photos: upload, cover selection, public discovery, draft privacy and removal', async () => {
  const store = new MemoryStore(), config = readConfig({ ADMIN_UIDS: 'owner' });
  const objects = new Map();
  const bucket = { file: path => ({
    save: async bytes => objects.set(path, bytes),
    download: async () => [objects.get(path)],
    delete: async () => objects.delete(path),
  }) };
  const server = createServer(config, { store, bucket, verify: async uid => ({ uid }) }, new FakeGateway());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, identity, method = 'GET', body) => fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(identity ? { Authorization: 'Bearer ' + identity } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = async (path, method = 'GET', body) => {
    const r = await request(path, 'owner', method, body);
    assert.ok(r.ok, `${method} ${path}: ${r.status}`);
    return r.json();
  };
  const input = { name: 'Photo test ground', town: 'Kochi', district: 'Ernakulam', address: 'Test address', lat: 9.98, lng: 76.3, formats: [7], surface: 'Artificial grass', price: 1200, slotDuration: 60, cutoffHours: 2, refundPercent: 100, active: true, published: false };
  const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aW9sAAAAASUVORK5CYII=';
  try {
    const { turf } = await json('/admin/turfs', 'POST', input);
    const path = `/admin/turfs/${turf.id}`;
    assert.equal((await request(path + '/photos', undefined, 'POST', { data })).status, 401);
    assert.equal((await request(path + '/photos', 'customer', 'POST', { data })).status, 403);
    assert.equal((await request(path + '/photos', 'owner', 'POST', { data: Buffer.from('<svg/>').toString('base64') })).status, 400);
    assert.equal((await request(path + '/photos', 'owner', 'POST', { data: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64') })).status, 400);
    const first = (await json(path + '/photos', 'POST', { data, alt: 'Pitch from entrance' })).image;
    const second = (await json(path + '/photos', 'POST', { data, alt: 'Floodlit pitch' })).image;
    assert.equal((await json(path + '/photos')).coverImageId, first.id);
    assert.equal((await request('/images/' + first.id)).status, 401);
    assert.equal((await request('/images/' + first.id, 'customer')).status, 403);
    const preview = await request('/images/' + first.id, 'owner');
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(Buffer.from(await preview.arrayBuffer()), Buffer.from(data, 'base64'));
    assert.equal((await json('/turfs')).turfs.length, 0);
    assert.equal((await request(path + '/cover', 'customer', 'PATCH', { imageId: second.id })).status, 403);
    const other = (await json('/admin/turfs', 'POST', { ...input, name: 'Other test ground' })).turf;
    assert.equal((await request(`/admin/turfs/${other.id}/cover`, 'owner', 'PATCH', { imageId: second.id })).status, 400);
    await json(path + '/cover', 'PATCH', { imageId: second.id });
    await json(path, 'PATCH', { ...input, published: true });
    const search = await (await request('/turfs?q=Photo')).json();
    assert.equal(search.turfs[0].coverImageId, second.id);
    assert.equal((await request('/images/' + second.id)).status, 200);
    const detail = await (await request('/turfs/' + turf.id)).json();
    assert.deepEqual(detail.photos.map(p => p.id), [second.id, first.id]);
    await json('/admin/images/' + second.id, 'DELETE');
    assert.equal((await json('/turfs')).turfs[0].coverImageId, first.id);
    assert.equal((await request('/images/' + second.id)).status, 404);
    assert.equal((await request(path + '/cover', 'owner', 'PATCH', { imageId: second.id })).status, 400);
    await json('/admin/images/' + first.id, 'DELETE');
    assert.equal((await json('/turfs')).turfs[0].coverImageId, null);
    assert.equal((await json('/turfs/' + turf.id)).photos.length, 0);
    await json(path + '/photos', 'POST', { data });
    await json(path, 'DELETE');
    assert.equal((await json('/turfs')).turfs.length, 0);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('new admin turfs appear publicly without slots; drafts and inactive turfs stay hidden', async () => {
  const store = new MemoryStore(), config = readConfig({ ADMIN_UIDS: 'owner' });
  const server = createServer(config, { store, verify: async uid => ({ uid }) }, new FakeGateway());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function request(path, method = 'GET', body) {
    const response = await fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json', ...(method !== 'GET' ? { Authorization: 'Bearer owner' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    assert.ok(response.ok, `${method} ${path}: ${response.status}`);
    return response.json();
  }
  const input = { name: 'New community ground', town: 'Kochi', district: 'Ernakulam', address: 'Test address', lat: 9.98, lng: 76.3, formats: [7], surface: 'Artificial grass', price: 1200, slotDuration: 60 };
  try {
    const { turf } = await request('/admin/turfs', 'POST', input);
    assert.equal(turf.published, true);
    const listing = (await request('/turfs')).turfs;
    assert.equal(listing.length, 1);
    assert.equal(listing[0].id, turf.id);
    assert.equal(listing[0].openSlots, 0);
    assert.equal((await request(`/turfs/${turf.id}`)).turf.name, input.name);
    assert.equal((await request('/turfs?available=true')).turfs.length, 0);
    const { turf: draft } = await request('/admin/turfs', 'POST', { ...input, published: false });
    await request(`/admin/turfs/${draft.id}`, 'PATCH', { ...input, name: 'Updated draft' });
    assert.equal((await request('/turfs')).turfs.length, 1);
    await request(`/admin/turfs/${draft.id}`, 'PATCH', { ...input, published: true });
    assert.equal((await request('/turfs')).turfs.length, 2);
    await request(`/admin/turfs/${turf.id}`, 'PATCH', { ...input, active: false });
    assert.deepEqual((await request('/turfs')).turfs.map(t => t.id), [draft.id]);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
