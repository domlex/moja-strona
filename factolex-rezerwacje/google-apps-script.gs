/**
 * Google Apps Script - backend rezerwacji Factolex.
 * Publikacja: Wdróż > Nowe wdrożenie > Aplikacja internetowa > Uruchamiaj jako Ja.
 * UWAGA: nie publikuj jako anonimowego endpointu przed dodaniem ochrony antyspamowej.
 * CalendarApp + GmailApp wymagają zgody właściciela konta.
 */
const ADMIN_EMAIL='marchewkadominik@gmail.com';
const CALENDAR_ID='primary';
function doPost(e){
  const lock=LockService.getScriptLock();
  try{
    if(!lock.tryLock(12000))throw Error('System jest zajęty. Spróbuj ponownie.');
    const x=JSON.parse(e.postData.contents);
    const safe=(v,n)=>String(v||'').trim().slice(0,n);
    const name=safe(x.name,120),email=safe(x.email,180),phone=safe(x.phone,30),office=safe(x.office,40),type=safe(x.type,80),note=safe(x.note,300);
    if(!name||!email.match(/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/)||!phone)throw Error('Nieprawidłowe dane kontaktowe');
    if(!['Kraków','Olkusz','Telefonicznie'].includes(office))throw Error('Nieprawidłowa lokalizacja');
    const date=safe(x.day,10),time=safe(x.time,5);
    if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)||!/^\\d{2}:00$/.test(time))throw Error('Nieprawidłowy termin');
    const [yy,mm,dd]=date.split('-').map(Number),hour=Number(time.slice(0,2));
    const start=new Date(yy,mm-1,dd,hour,0,0),end=new Date(start.getTime()+60*60*1000);
    if(start.getFullYear()!==yy||start.getMonth()!==mm-1||start.getDate()!==dd||start<new Date())throw Error('Nieprawidłowa data');
    const wd=start.getDay();
    const allowed=(office==='Kraków'&&[1,5].includes(wd)&&hour>=15&&hour<20)||(office==='Olkusz'&&wd===4&&hour>=14&&hour<17)||(office==='Olkusz'&&wd===6&&hour>=10&&hour<13)||(office==='Telefonicznie'&&wd>=1&&wd<=5&&hour>=10&&hour<17);
    if(!allowed)throw Error('Godzina jest poza harmonogramem');
    const cal=CalendarApp.getCalendarById(CALENDAR_ID);
    if(!cal)throw Error('Brak dostępu do kalendarza');
    if(cal.getEvents(start,end).length)throw Error('Termin został już zajęty');
    const description='Kontakt: '+name+'\\nE-mail: '+email+'\\nTelefon: '+phone+'\\nRodzaj: '+type+'\\nUwagi organizacyjne: '+note;
    cal.createEvent('Factolex – konsultacja '+office,start,end,{description,guests:email,sendInvites:true});
    GmailApp.sendEmail(email,'Factolex – potwierdzenie terminu','Dzień dobry,\\n\\nPotwierdzamy konsultację: '+date+' o '+time+' ('+office+').\\n\\nFactolex\\n530 834 077');
    GmailApp.sendEmail(ADMIN_EMAIL,'Nowa rezerwacja Factolex',date+' '+time+' – '+office+'\\n'+description);
    return json_({ok:true});
  }catch(err){return json_({ok:false,error:String(err.message||err)});}
  finally{try{lock.releaseLock()}catch(_){}}
}
function json_(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON)}
