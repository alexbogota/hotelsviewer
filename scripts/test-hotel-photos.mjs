// Offline checks of the hotel photo finder (no network): npm run test:hotel-photos
import { sameName, mentions, pickItem, judge } from './find-hotel-photos.mjs';
import assert from 'node:assert';
assert(sameName('Shangri-La Hotel, Paris', 'Shangri-La Paris'));
assert(!sameName('Hotel Paris', 'Shangri-La Paris'));
assert(mentions('File:Facade of the Pullman Paris Tour Eiffel hotel.jpg', 'Pullman Paris Tour Eiffel'));
assert(!mentions('File:Eiffel Tower Paris.jpg', 'Pullman Paris Tour Eiffel'));
const near = { lat: 48.8584, lng: 2.2945 };
const ent = [{ id: 'Q1', labels: { en: { value: 'Shangri-La Hotel, Paris' } }, claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: 48.8636, longitude: 2.2935 } } } }], P18: [{ mainsnak: { datavalue: { value: 'X.jpg' } } }] } },
  { id: 'Q2', labels: { en: { value: 'Shangri-La Hotel, Singapore' } }, claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: 1.31, longitude: 103.8 } } } }] } }];
const it = pickItem(ent, { name: 'Shangri-La Paris' }, near); assert.equal(it.id, 'Q1'); assert.equal(it.image, 'X.jpg');
const page = (title, lic, desc = '', w = 2000, mime = 'image/jpeg') => ({ title, imageinfo: [{ mime, width: w, height: 1000, descriptionurl: 'u', thumburl: 't', extmetadata: { LicenseShortName: { value: lic }, ImageDescription: { value: desc }, Artist: { value: '<a>Me</a>' } } }] });
let j = judge(page('File:View of the Eiffel Tower from Shangri-La Paris suite.jpg', 'CC BY-SA 4.0'), { name: 'Shangri-La Paris' }, 'eiffel-tower', 'search by name');
assert(j.ok, j.why); assert.equal(j.kind, 'view-from'); assert.equal(j.author, 'Me');
assert(!judge(page('File:Shangri-La Paris.jpg', 'CC BY-NC 2.0'), { name: 'Shangri-La Paris' }, 'eiffel-tower', 'category X').ok);
assert(!judge(page('File:Shangri-La Paris at night.jpg', 'CC0'), { name: 'Shangri-La Paris' }, 'eiffel-tower', 'category X').ok);
assert(judge(page('File:Hotel Bellagio at night.jpg', 'CC0'), { name: 'Bellagio' }, 'bellagio-fountains', 'category X').ok);
assert(!judge(page('File:Shangri-La Paris logo.png', 'CC0'), { name: 'Shangri-La Paris' }, 'eiffel-tower', 'category X').ok);
assert(!judge(page('File:Avenue d Iena.jpg', 'CC0', 'a street'), { name: 'Shangri-La Paris' }, 'eiffel-tower', 'search by name').ok);
const P = { near, city: 'Paris' };
const far = { ...page('File:Bellagio outside.jpg', 'CC0'), coordinates: [{ lat: 45.98, lon: 9.26 }] };
assert(!judge(far, { name: 'Bellagio' }, 'bellagio-fountains', 'category X', { near: { lat: 36.1126, lng: -115.1767 }, city: 'Las Vegas' }).ok);
const close = { ...page('File:Bellagio outside.jpg', 'CC0'), coordinates: [{ lat: 36.113, lon: -115.176 }] };
assert(judge(close, { name: 'Bellagio' }, 'bellagio-fountains', 'category X', { near: { lat: 36.1126, lng: -115.1767 }, city: 'Las Vegas' }).ok);
assert(!judge(page('File:Splendid Hotel, Becici.jpg', 'CC0'), { name: 'Splendid Hotel' }, 'eiffel-tower', 'search by name', P).ok);
assert(judge(page('File:Splendid Hotel Paris.jpg', 'CC0'), { name: 'Splendid Hotel' }, 'eiffel-tower', 'search by name', P).ok);
assert.equal(judge(page('File:View from our room in Bellagio Las Vegas.jpg', 'CC0'), { name: 'Planet Hollywood Resort & Casino' }, 'bellagio-fountains', 'category X', { city: 'Las Vegas' }).kind, 'hotel');
console.log('all ok');
