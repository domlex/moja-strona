const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const code = fs.readFileSync(__dirname+'/Code.gs','utf8');
let tests=0;
function fixture() {
 const data={VERIFICATION_SECRET:'test-only-secret',BOOKINGS_ENABLED:'true',TEST_MODE:'true',BOOKING_CALENDAR_ID:'dedicated'};
 const state={email:'marchewkadominik@gmail.com',sent:[],events:[],lock:true,released:0,conflict:false};
 const props={getProperty:k=>data[k]??null,setProperty:(k,v)=>data[k]=v,deleteProperty:k=>delete data[k],getProperties:()=>({...data}),setProperties:o=>Object.assign(data,o)};
 const calendar={getEvents:()=>state.conflict?[{getStartTime:()=>new Date(0),getEndTime:()=>new Date('2100-01-01')}]:[],createEvent:(...args)=>{state.events.push(args);return {setVisibility(){},deleteEvent(){state.events.pop();}}},getName:()=> 'test'};
 const ctx={console,Date,PropertiesService:{getScriptProperties:()=>props},Session:{getActiveUser:()=>({getEmail:()=>state.email})},Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(a,s)=>crypto.createHash(a).update(s).digest(),computeHmacSha256Signature:(s,k)=>crypto.createHmac('sha256',k).update(s).digest(),base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),formatDate:(d,t,f)=>f==='yyyyMMdd'?'20261105':f==='yyyy-MM-dd'?'2026-11-05':d.toISOString()},CalendarApp:{getCalendarById:()=>calendar,getDefaultCalendar:()=>({getEvents:()=>[]}),Visibility:{PRIVATE:'private'}},LockService:{getScriptLock:()=>({tryLock:()=>state.lock,releaseLock:()=>state.released++})},MailApp:{getRemainingDailyQuota:()=>100,sendEmail:m=>state.sent.push(m)},Logger:{log:()=>{}}};
 vm.createContext(ctx);vm.runInContext(code,ctx);return {ctx,state,data};
}
function test(name,fn){fn();tests++;console.log('PASS '+name);}
function validInput(){const d=new Date(Date.now()+3*864e5);while(d.getDay()!==1)d.setDate(d.getDate()+1);return {office:'Kraków',day:d.toISOString().slice(0,10),time:'15:00',name:'Test Osoba',email:'marchewkadominik@gmail.com',phone:'+48500000000',privacyAccepted:true,website:''};}
function verify(f){const r=f.ctx.requestVerification({email:'marchewkadominik@gmail.com'});return {verificationId:r.verificationId,verificationCode:f.state.sent[0].body.match(/Kod: (\d{6})/)[1]};}
test('closed by default / public gate',()=>{const f=fixture();f.data.BOOKINGS_ENABLED='false';assert.equal(f.ctx.publicStatus().enabled,false);assert.throws(()=>f.ctx.submitBooking({}));assert.equal(f.state.events.length,0);});
test('test mode denies nonowner and empty identity',()=>{const f=fixture();for(const email of ['','other@example.org']){f.state.email=email;assert.equal(f.ctx.publicStatus().enabled,false);assert.equal(f.ctx.getAvailability({}).slots.length,0);assert.throws(()=>f.ctx.requestVerification({email}));assert.throws(()=>f.ctx.setupTest_());}});
test('production requires passed security gate',()=>{const f=fixture();f.data.TEST_MODE='false';assert.equal(f.ctx.isEnabled_(),false);f.data.SECURITY_TESTS_PASSED='true';assert.equal(f.ctx.isEnabled_(),true);});
test('strict emails reject recipient injection',()=>{const f=fixture();for(const e of ['x@example.org,y@example.org','x@example.org\nbcc:z@example.org','a@b','<a>@b.org'])assert.equal(f.ctx.validEmail_(e),false);});
test('field validation rejects overlength, objects and HTML',()=>{const f=fixture();for(const s of ['x'.repeat(101),{},'<img>', 'x\ny'])assert.throws(()=>f.ctx.clean_(s,100));});
test('invalid dates and office rejected',()=>{const f=fixture();for(const d of ['2026-02-30','2026-13-01','2026-1-1','abc'])assert.throws(()=>f.ctx.parseDay_(d));assert.throws(()=>f.ctx.validateOffice_('Telefonicznie'));});
test('verification emails only owner in testing',()=>{const f=fixture();assert.throws(()=>f.ctx.requestVerification({email:'other@example.org'}));assert.equal(f.state.sent.length,0);});
test('honeypot blocked',()=>{const f=fixture();assert.throws(()=>f.ctx.requestVerification({email:'marchewkadominik@gmail.com',website:'bot'}));assert.throws(()=>f.ctx.submitBooking({...validInput(),website:'bot'}));});
test('missing verification cannot create calendar entry',()=>{const f=fixture();assert.throws(()=>f.ctx.submitBooking(validInput()));assert.equal(f.state.events.length,0);assert.equal(f.state.released,1);});
test('codes expire and wrong email invalidates',()=>{const f=fixture();const v=verify(f);assert.throws(()=>f.ctx.verifiedContact_(v,'other@example.org'));let r=JSON.parse(f.data['verify_'+v.verificationId]);r.expires=0;f.data['verify_'+v.verificationId]=JSON.stringify(r);assert.throws(()=>f.ctx.verifiedContact_(v,'marchewkadominik@gmail.com'));});
test('five incorrect attempts lock code',()=>{const f=fixture();const v=verify(f);const wrong=v.verificationCode==='000000'?'000001':'000000';for(let i=0;i<5;i++)assert.throws(()=>f.ctx.verifiedContact_({...v,verificationCode:wrong},'marchewkadominik@gmail.com'));assert.throws(()=>f.ctx.verifiedContact_(v,'marchewkadominik@gmail.com'));});
test('persistent verification cooldown and global quota',()=>{const f=fixture();verify(f);assert.throws(()=>f.ctx.requestVerification({email:'marchewkadominik@gmail.com'}));const g=fixture();g.data.mailcount_20261105='30';assert.throws(()=>g.ctx.requestVerification({email:'marchewkadominik@gmail.com'}));});
test('verified booking, confirmation and retry idempotency',()=>{const f=fixture();const input={...validInput(),...verify(f)};const r=f.ctx.submitBooking(input);assert.equal(r.ok,true);assert.equal(f.state.events.length,1);assert.equal(f.state.sent.length,3);assert.equal(f.ctx.submitBooking(input).ok,true);assert.equal(f.state.events.length,1);assert.equal(f.state.sent.length,3);});
test('calendar conflict and lock contention fail closed',()=>{for(const mode of ['conflict','lock']){const f=fixture();const input={...validInput(),...verify(f)};f.state[mode]=mode==='conflict';assert.throws(()=>f.ctx.submitBooking(input));assert.equal(f.state.events.length,0);}});
test('mail failure preserves booking and retry does not duplicate',()=>{const f=fixture();const input={...validInput(),...verify(f)};f.ctx.MailApp.sendEmail=()=>{throw Error('quota');};assert.equal(f.ctx.submitBooking(input).mailSent,false);assert.equal(f.ctx.submitBooking(input).ok,true);assert.equal(f.state.events.length,1);});
test('consent and schedule validation',()=>{const f=fixture();for(const p of [{privacyAccepted:false},{time:'23:00'},{day:'2020-01-01'}])assert.throws(()=>f.ctx.submitBooking({...validInput(),...p}));});
console.log(`${tests} security tests passed (mock Google services; live integration still required).`);
