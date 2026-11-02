import {SUBJECTS, SESSION_OPTIONS, examYears, recommendRhythms, subjectMilestones, defaultState, restoreState, validate, buildPlan, recommendRhythm, makeICS, dateKey, addDays, monday, timeText, validDate} from './engine.mjs';
import {translate} from './i18n.mjs';
import {WORKLOAD} from './workload.mjs';

const STORAGE_KEY = 'dragi-nmt-planning-v2';
const IS_LOCAL = ['localhost','127.0.0.1','::1'].includes(location.hostname);
const root = document.querySelector('#app');
let restored;
let storageAvailable = true;
try { restored = restoreState(localStorage.getItem(STORAGE_KEY)); } catch { restored = {state: defaultState(), status: 'new'}; storageAvailable = false; }
let state = restored.state;
const cleanUrl=new URL(location.href);
if(cleanUrl.searchParams.has('lang')){cleanUrl.searchParams.delete('lang');history.replaceState({},'',cleanUrl);}
let banner = restored.status === 'new' ? '' : restored.status === 'invalid' ? 'invalidDraft' : restored.status;
let error = '';
let view = 'week';
let week = monday(state.start);
let resetOpen = false;
let toast = '';
let toastTimer;
const t = key => translate(state.locale, key);
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const path = {
  arrow:'M5 12h14m-6-6 6 6-6 6', back:'M19 12H5m6-6-6 6 6 6', check:'m5 12 4 4L19 6', calendar:'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z', clock:'M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', book:'M12 5v16M3 3l9 2 9-2v16l-9 2-9-2V3Z', math:'M5 7h6M8 4v6m7-3h5M5 17h6m-5-3 4 6m6-6 4 6m0-6-4 6', history:'M4 10h16M5 10v9m5-9v9m4-9v9m5-9v9M3 21h18M3 7l9-5 9 5H3Z', globe:'M2 12h20M12 2c6 5 6 15 0 20-6-5-6-15 0-20Zm10 10a10 10 0 1 1-20 0 10 10 0 0 1 20 0', flask:'M9 3h6m-5 0v7L4 20h16l-6-10V3M7 15h10', leaf:'M20 3C10 1 2 8 5 17c9 5 17-3 15-14ZM4 21 16 8', bolt:'m13 2-9 12h7l-1 8 10-13h-7l0-7Z', lock:'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5V10Zm7 4v3', download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4', print:'M7 8V3h10v5M7 17H3V8h18v9h-4M7 14h10v7H7v-7Z', info:'M12 11v6m0-10v1m10 4a10 10 0 1 1-20 0 10 10 0 0 1 20 0', moon:'M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12Z', spark:'m12 3 2 7 7 2-7 2-2 7-2-7-7-2 7-2 2-7Z', chevron:'m9 5 7 7-7 7', left:'m15 5-7 7 7 7', external:'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7'
};
function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="${path[name] || path.book}"/>
</svg>`; }
const subjectStyle = {
  ukrainian:['#eee8ff','#7950be','book'], math:['#e5efff','#4878b9','math'], history:['#fff0df','#b47b38','history'], english:['#ffe9ed','#b65379','EN'], literature:['#f0e8fa','#8653a8','book'], geography:['#e8f5e9','#4c8a54','globe'], chemistry:['#fae8f0','#a95984','flask'], biology:['#e6f5ed','#4a876b','leaf'], physics:['#fff5d9','#967327','bolt'], german:['#e9eaf9','#6673a5','DE']
};
function color(id) { return `--subject-bg:${subjectStyle[id][0]};--subject-ink:${subjectStyle[id][1]}`; }
function subjectIcon(id) { const glyph = subjectStyle[id][2]; return `<span class="subject-icon" aria-hidden="true">${glyph.length === 2 ? glyph : icon(glyph)}</span>`; }
function formatDate(value, full = false) {
  if (!validDate(value)) return '—';
  return new Intl.DateTimeFormat(state.locale, {day:'numeric', month:full ? 'long' : 'short', ...(full ? {year:'numeric'} : {})}).format(new Date(`${value}T12:00:00`));
}
function duration(minutes) {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `${h ? `${h} ${t('hoursUnit')}` : ''}${h && m ? ' ' : ''}${m || !h ? `${m} ${t('minutesUnit')}` : ''}`;
}
function names() { return t('subjectNames'); }
function countText(count, kind) {const forms=t(kind+'Forms');return `${count} ${esc(forms[new Intl.PluralRules(state.locale).select(count)]||forms.other)}`;}
function requiredMinutes() { return state.selected.reduce((sum,id) => sum+WORKLOAD.subjects[id].minutes,0); }
function lessons() { return state.selected.reduce((sum,id) => sum+WORKLOAD.subjects[id].lessons,0); }
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); storageAvailable = true; } catch { storageAvailable = false; }
}
function heading(first, accent, lead, eyebrow = '') {
  return `${eyebrow ? `<p class="eyebrow">${esc(t(eyebrow))}</p>` : ''}<h1 id="page-heading" tabindex="-1">${esc(t(first))}<br>
<em>${esc(t(accent))}</em>
</h1>
<p class="lead">${esc(t(lead))}</p>`;
}
function actions() {
  return `<div class="actions">${state.step > 1 ? `<button class="text-button" type="button" data-action="back">${icon('back')}${esc(t('back'))}</button>` : `<span class="private-note">${icon('lock')}${esc(t('private'))}</span>`}<button class="primary" type="submit">${esc(t(state.step === 3 ? 'build' : 'next'))}${icon('arrow')}</button>
</div>`;
}
function subjectsPage() {
  return `${heading('introTitle','introAccent','introLead','introEyebrow')}<section class="section">
<div class="section-head">
<h2>${esc(t('chooseTitle'))}</h2>
<span class="count" aria-live="polite">${esc(t('selected'))}: ${state.selected.length}</span>
</div>
<p class="section-lead">${esc(t('chooseLead'))}</p>
<div class="subject-grid" role="group" aria-label="${esc(t('subjectsStep'))}">${SUBJECTS.map(id => `<button id="subject-${id}" class="subject" type="button" style="${color(id)}" data-action="subject" data-subject="${id}" aria-pressed="${state.selected.includes(id)}">${subjectIcon(id)}<span class="name">${esc(names()[id])}<small class="subject-count">${countText(WORKLOAD.subjects[id].lessons,'lesson')}</small>
</span>
<span class="check">${icon('check')}</span>
</button>`).join('')}</div>
<p class="hint">${esc(t('timeBased'))}</p>
</section>`;
}
function datesPage() {
  const period=validDate(state.start)&&validDate(state.end)?Math.max(0,Math.round((new Date(state.end+'T12:00:00Z')-new Date(state.start+'T12:00:00Z'))/86400000)):0;
  const years=examYears();
  return `${heading('datesTitle','datesAccent','datesLead')}
  <section class="section panel">
    <fieldset><legend class="field-legend">Рік складання НМТ</legend><div class="exam-years">${years.map(option=>`<button id="year-${option.year}" type="button" class="exam-year" data-action="examYear" data-value="${option.year}" aria-pressed="${state.examYear===option.year}"><span>${option.label}</span><strong>${option.year}</strong>${!option.available?'<small>Орієнтир 20 травня вже минув</small>':''}</button>`).join('')}</div></fieldset>
    <div class="dates-grid exam-dates"><label class="field"><span>${esc(t('startDate'))}</span><input id="start" name="start" type="date" value="${state.start}" min="${dateKey(new Date())}" max="${validDate(state.end)?addDays(state.end,-1):''}" required></label><label class="field"><span>${esc(t('endDate'))}</span><input id="end" name="end" type="date" value="${state.end}" min="${[`${state.examYear}-01-01`,addDays(dateKey(new Date()),1)].sort().at(-1)}" max="${state.examYear}-12-31" required></label></div>
    <p class="exam-date-note">${esc(t('personalDate'))}</p>
    <button type="button" class="text-button" data-action="may20">${icon('calendar')}${esc(t('useMay20'))}</button>
    <div class="period"><span class="period-icon">${icon('calendar')}</span><div><span>${esc(t('period'))}</span><strong>${period} <small>${esc(t('daysUnit'))}</small></strong></div></div>
  </section>
  <section class="section"><label class="field"><span>${esc(t('reserveLabel'))}</span><select id="reserve" name="reserve">${[0,7,14,21,28].map(n=>`<option value="${n}" ${state.reserve===n?'selected':''}>${n?countText(n,'day'):esc(t('noReserve'))}</option>`).join('')}</select></label><p class="hint">${esc(t('reserveHint'))}</p></section>
  <div class="tip">${icon('book')}<div><strong>${esc(t('workloadTitle'))} · ${duration(requiredMinutes())}</strong><p>${countText(lessons(),'lesson')} · ${esc(t('theoryIncluded'))}</p></div></div>
  ${programOutline()}`;
}
function programOutline(){
  return `<section class="section"><h2>${esc(t('coursework'))}</h2><p class="section-lead">Реальні розділи обраних курсів Dragi.</p><div class="program-outline">${state.selected.map(id=>`<details style="${color(id)}"><summary>${subjectIcon(id)}<span>${esc(names()[id])}<small>${countText(WORKLOAD.subjects[id].lessons,'lesson')} · ${duration(WORKLOAD.subjects[id].minutes)}</small></span></summary><ol>${WORKLOAD.subjects[id].sections.map(section=>`<li><span>${esc(section.name)}</span><small>${section.minutes?`${countText(section.lessons,'lesson')} · ${duration(section.minutes)}`:esc(t('noContent'))}</small></li>`).join('')}</ol></details>`).join('')}</div></section>`;
}
function paceProfiles(){
  const profiles=recommendRhythms(state);
  return `<section class="section"><h2>Рекомендований графік</h2><p class="section-lead">${esc(t('recommendationHint'))}</p><div class="pace-profiles">${profiles.map(profile=>{
    const active=profile.feasible&&state.paceMode==='recommended'&&state.days.every((day,i)=>day.enabled===profile.weekdays.includes(i)&&(!day.enabled||day.minutes===profile.minutes));
    return `<button id="profile-${profile.id}" class="pace-card" type="button" data-action="profile" data-value="${profile.id}" aria-pressed="${active}" ${profile.feasible?'':'disabled'}><span class="pace-name">${esc(profile.name)}${active?icon('check'):''}</span><small>${esc(profile.description)}</small>${profile.feasible?`<strong>${profile.days} дн. × ${profile.minutes} хв</strong><span class="pace-detail">на день, включно з перервами</span><span class="pace-finish">${icon('check')}Увесь матеріал до ${formatDate(profile.finish)}</span>`:`<p>${esc(t('recommendationUnavailable'))}</p>`}</button>`;
  }).join('')}</div></section>`;
}
function subjectRoadmap(plan){
  if(plan.error)return '';
  const rows=subjectMilestones(state,plan);
  return `<section class="section subject-roadmap"><h2>${esc(t('roadmapTitle'))}</h2><p class="section-lead">${esc(t('roadmapLead'))}</p><div class="route-cards">${rows.map((row,index)=>`<article class="route-card" style="${color(row.subject)}"><header>${subjectIcon(row.subject)}<div><h3>${esc(names()[row.subject])}</h3><p>${countText(row.lessons,'lesson')} · ${duration(row.minutes)}</p></div></header><div class="route-metrics"><div><strong>${duration(row.weeklyMinutes)}</strong><small>${esc(t('weeklyAverage'))}</small></div><div><strong>${row.finish?formatDate(row.finish):'Потрібно більше часу'}</strong><small>${esc(t('byDate'))}</small></div></div><p class="strip-caption">Розподіл обсягу за розділами</p><div class="section-strip" role="img" aria-label="Послідовність розділів ${esc(names()[row.subject])}">${row.sections.filter(section=>section.minutes).map((section,i)=>`<span style="flex-grow:${section.minutes};opacity:${.4+(i%4)*.18}" title="${esc(section.name)} · ${duration(section.minutes)}"></span>`).join('')}</div>${row.deficit?`<p class="route-deficit">Не вміщується ${duration(row.deficit)}</p>`:`<p class="route-complete">${icon('check')}Усі уроки й теорія в плані</p>`}<details ${state.step===4&&index===0?'open':''}><summary>${esc(t('sectionsLabel'))}<span>${row.sections.filter(section=>section.minutes).length}</span></summary><ol class="milestones">${row.sections.map((section,i)=>`<li class="${section.minutes?'':'empty-stage'}"><span class="milestone-number">${i+1}</span><div><strong>${esc(section.name)}</strong><small>${section.minutes?`${countText(section.lessons,'lesson')} · ${duration(section.minutes)}`:esc(t('noContent'))}</small></div>${section.minutes?`<time datetime="${section.finish||''}" title="${section.finish?formatDate(section.finish,true):esc(t('notScheduled'))}">${section.finish?'до '+formatDate(section.finish):'Не вміщується'}</time>`:''}</li>`).join('')}</ol></details></article>`).join('')}</div><p class="hint">${esc(t('milestoneNote'))}</p></section>`;
}
function paceStatus(plan, compact = false) {
  if (plan.error) return '';
  if (plan.feasible) return `<div class="feasibility success" role="status">${icon('check')}<div>
<strong>${esc(t('courseFits'))}</strong>
<p>${esc(t('estimatedFinish'))}: <b>${formatDate(plan.finish,true)}</b>
</p>${!compact ? `<p>${esc(t('review'))}: ${duration(plan.reviewMinutes)} · ${countText(state.reserve,'day')}</p>` : ''}</div>
</div>`;
  return `<div class="availability" role="status">
<strong>${esc(t('notEnough'))}</strong>
<p>${esc(t('deficit'))}: <b>${duration(plan.deficit)}</b>.</p>
<p>${plan.forecast ? `${esc(t('forecast'))} <b>${formatDate(plan.forecast,true)}</b>` : esc(t('forecastUnavailable'))}</p>${!compact ? `<button class="secondary" type="button" data-action="rhythm">${esc(t('changeRhythm'))}</button>${state.examYear===examYears()[0].year ? ` <button class="secondary" type="button" data-action="nextExamYear">${esc(t('chooseNextYear'))}</button>`:''}` : ''}</div>`;
}
function rhythmPage() {
  const plan = buildPlan(state);
  const first = monday(state.start);
  const weekly = plan.events.filter(e => e.date >= first && e.date <= addDays(first,6));
  return `${heading('rhythmTitle','rhythmAccent','rhythmLead')}${paceProfiles()}<div class="section rhythm-controls">
<fieldset>
<legend>${esc(t('sessionLength'))}</legend>
<div class="chips">${SESSION_OPTIONS.map(n => `<button id="session-${n}" type="button" class="chip" data-action="session" data-value="${n}" aria-pressed="${state.session===n}">${n} ${esc(t('minutesUnit'))}</button>`).join('')}</div>
</fieldset>
<label class="field">
<span>${esc(t('breakLength'))}</span>
<select name="pause" id="pause">${[0,5,10,15].map(n => `<option value="${n}" ${state.pause===n?'selected':''}>${n?`${n} ${esc(t('minutesUnit'))}`:esc(t('noBreak'))}</option>`).join('')}</select>
</label>
</div>
<p class="hint">${esc(t('nativeHint'))}</p>
<section class="section">
<div class="section-head">
<h2>${esc(t('ownDays'))}</h2>
</div>
<div class="chips">${[['weekdays',[0,1,2,3,4]],['threeDays',[0,2,4]],['weekend',[5,6]]].map(([key,days]) => `<button type="button" class="chip" data-action="daysPreset" data-value="${key}" aria-pressed="${state.days.every((d,i)=>d.enabled===days.includes(i))}">${esc(t(key))}</button>`).join('')}</div>
<div class="day-list">${state.days.map((day,i)=>`<div class="day-row ${day.enabled?'':'off'}">
<label class="day-label">
<input id="day-${i}" type="checkbox" name="day" data-day="${i}" ${day.enabled?'checked':''}>
<span>${esc(t('dayNames')[i])}</span>
</label>${day.enabled?`<label class="field">
<span>${esc(t('startAt'))}</span>
<input id="time-${i}" name="dayTime" data-day="${i}" type="time" value="${day.start}" required aria-label="${esc(t('dayNames')[i]+' · '+t('startAt'))}">
</label>
<label class="field">
<span>${esc(t('availableTime'))}</span>
<select id="minutes-${i}" name="dayMinutes" data-day="${i}" aria-label="${esc(t('dayNames')[i]+' · '+t('availableTime'))}">${[20,30,45,60,90,120,150,180,240].map(n=>`<option value="${n}" ${day.minutes===n?'selected':''}>${n} ${esc(t('minutesUnit'))}</option>`).join('')}</select>
</label>`:`<span class="rest-text">${esc(t('rest'))}</span>`}</div>`).join('')}</div>
<p class="hint">${esc(t('restNote'))}</p>
</section>${paceStatus(plan,true)}${subjectRoadmap(plan)}${!plan.error?`<div class="weekly-strip">
<strong>${duration(weekly.reduce((sum,e)=>sum+e.minutes,0))}</strong>
<span>${esc(t('firstWeek'))}<br>${esc(t('breaksIncluded'))}</span>
</div>`:''}`;
}
function slotCard(event) {
  const possible = event.kind === 'review' ? state.selected : (event.choices || state.selected);
  return `<article class="session" style="${color(event.subject)}">
<div class="session-time">${timeText(event.start)} – ${timeText(event.end)}</div>
<label class="slot-label">
<span class="sr-only">${esc(t('subjectForSlot'))} · ${event.date} ${timeText(event.start)}</span>
<select id="slot-${event.key}" data-slot="${event.key}" aria-label="${esc(t('subjectForSlot'))} ${event.date} ${timeText(event.start)}">${possible.map(id=>`<option value="${id}" ${id===event.subject?'selected':''}>${esc(names()[id])}</option>`).join('')}</select>
</label>
<small>${event.minutes} ${esc(t('minutesUnit'))}${event.kind==='review'?` · ${esc(t('review'))}`:''}</small>${event.sections?.length?`<p class="session-content" title="${esc(event.sections.map(section=>section.name).join(' → '))}">${esc(event.sections.map(section=>section.name).join(' → '))}</p>`:''}
</article>`;
}
function storeLinks(){return `<div class="store-links">
<strong>${esc(t('continueDragi'))}</strong>
<div>
<a href="https://apps.apple.com/ua/app/%D0%B4%D1%80%D0%B0%D0%B3%D1%96-%D0%BF%D1%96%D0%B4%D0%B3%D0%BE%D1%82%D0%BE%D0%B2%D0%BA%D0%B0-%D0%B4%D0%BE-%D0%BD%D0%BC%D1%82-%D0%B7%D0%BD%D0%BE/id6502047535?utm_source=onboarding&amp;utm_medium=referral&amp;utm_campaign=onboarding_flow" target="_blank" rel="noopener noreferrer" data-store="apple">App Store ${icon('external')}</a>
<a href="https://play.google.com/store/apps/details?id=ua.dragi.education&amp;utm_source=onboarding&amp;utm_medium=referral&amp;utm_campaign=onboarding_flow" target="_blank" rel="noopener noreferrer" data-store="google">Google Play ${icon('external')}</a>
</div>
<p>${esc(t('transferHint'))}</p>
</div>`;}
function resultPage(plan) {
  const first = monday(state.start), last = monday(state.end);
  if (week<first || week>last) week=first;
  return `<div class="result-heading">
<div>${heading('resultTitle',plan.feasible?'resultAccent':'needsAdjustment','resultLead','resultEyebrow')}</div>
<img class="result-mascot" src="assets/mascot.png" alt="">
</div>${paceStatus(plan)}<div class="stats">
<div class="stat">${icon('book')}<div>
<strong>${duration(plan.required)}</strong>
<small>${esc(t('theoryIncluded'))} · ${countText(lessons(),'lesson')}</small>
</div>
</div>
<div class="stat">${icon('calendar')}<div>
<strong>${plan.events.length}</strong>
<small>${esc(t('totalSessions'))}</small>
</div>
</div>
<div class="stat">${icon('moon')}<div>
<strong>${7-state.days.filter(d=>d.enabled).length}</strong>
<small>${esc(t('restDays'))}</small>
</div>
</div>
</div>
<section class="calendar-panel" aria-label="${esc(t('planStep'))}">
<div class="calendar-toolbar">
<div class="week-controls">
<button class="icon-button" type="button" data-action="previousWeek" aria-label="${esc(t('previousWeek'))}" ${week<=first?'disabled':''}>${icon('left')}</button>
<span class="week-label">${formatDate(week)} — ${formatDate(addDays(week,6))}</span>
<button class="icon-button" type="button" data-action="nextWeek" aria-label="${esc(t('nextWeek'))}" ${week>=last?'disabled':''}>${icon('chevron')}</button>
</div>
<div class="view-switch" role="group" aria-label="${esc(t('planStep'))}">${['week','list'].map(v=>`<button type="button" data-action="view" data-value="${v}" aria-pressed="${view===v}">${esc(t(v+'View'))}</button>`).join('')}</div>
</div>
<div class="week-grid ${view==='list'?'list':''}">${Array.from({length:7},(_,i)=>{const date=addDays(week,i);const outside=date<state.start||date>=state.end;const events=plan.events.filter(e=>e.date===date);return `<section class="week-day ${outside?'outside':''} ${date===dateKey(new Date())?'today':''}">
<h3 class="day-head">
<span>${esc(t('shortDays')[i])}</span>
<strong>${new Date(date+'T12:00:00').getDate()}</strong>
</h3>${events.length?events.map(slotCard).join(''):`<div class="empty-day">${icon(outside?'calendar':'moon')}<span>${esc(t(date===state.end?'examDay':outside?'outsideRange':'noSessionsDay'))}</span>
</div>`}</section>`;}).join('')}</div>
<p class="calendar-note">${icon('info')}${esc(t('editHint'))}</p>
</section>
${subjectRoadmap(plan)}
<div class="result-bottom">
<section class="totals">
<h2>${esc(t('subjectTotals'))}</h2>${state.selected.map(id=>`<div class="total-row" style="${color(id)}">
<span>
<i>
</i>${esc(names()[id])}</span>
<strong>${duration(WORKLOAD.subjects[id].minutes)}</strong>
</div>${plan.remaining[id]>0?`<p class="remaining-line">${duration(plan.remaining[id])} ${esc(t('remaining'))}</p>`:''}`).join('')}<p class="hint">${esc(t('review'))}: ${duration(plan.reviewMinutes)}</p>
<p class="hint">${esc(t('timeBased'))}</p>
</section>
<section class="save-panel">
<h2>${esc(t('saveTitle'))}</h2>
<p>${esc(t('saveLead'))}</p>
<label class="field">
<span>${esc(t('reminder'))}</span>
<select name="reminder" id="reminder">${[0,5,10,15].map(n=>`<option value="${n}" ${state.reminder===n?'selected':''}>${n?`${n} ${esc(t('minutesUnit'))}`:esc(t('noReminder'))}</option>`).join('')}</select>
</label>
<div class="save-buttons">
<button type="button" class="primary" data-action="download" ${!plan.feasible||!plan.events.length?'disabled':''}>${icon('download')}${esc(t('exportCalendar'))} · .ics</button>
<button type="button" class="secondary" data-action="print">${icon('print')}${esc(t('print'))}</button>
</div>
<details>
<summary>${esc(t('importHelp'))}</summary>
<p>${esc(t('importInstructions'))}</p>
</details>${storeLinks()}</section>
</div>
<div class="result-actions">
<button type="button" class="secondary" data-action="rhythm">${icon('back')}${esc(t('changeRhythm'))}</button>
<button type="button" class="text-button" data-action="reset">${esc(t('reset'))}</button>
</div>${resetOpen?`<div class="reset-box">
<p>${esc(t('resetQuestion'))}</p>
<div class="chips">
<button type="button" class="chip" data-action="confirmReset">${esc(t('confirmReset'))}</button>
<button type="button" class="chip" data-action="cancelReset">${esc(t('cancel'))}</button>
</div>
</div>`:''}`;
}
function aside() {
  return `<aside class="aside">
<div class="mascot-card">
<span class="tiny">DRAGI PLANNING</span>
<h2>${esc(t('sidebarTitle'))}<br>
<span>${esc(t('sidebarAccent'))}</span>
</h2>
<div class="mascot-scene">
<span class="sparkle" aria-hidden="true">✧</span>
<span class="sparkle two" aria-hidden="true">✦</span>
<img src="assets/mascot.png" alt="">
<span class="float-pill">${icon('check')}${esc(t('sideBreaks'))}</span>
</div>
</div>
<p class="aside-lead">${esc(t('sidebarLead'))}</p>
<div class="summary">
<p class="label">${icon('calendar')}${esc(t('yourPlan'))}</p>${state.selected.length?`<div class="summary-subjects">${state.selected.map(id=>`<span>${esc(names()[id])}</span>`).join('')}</div>
<div class="summary-date">${formatDate(state.start)} → ${formatDate(state.end)}</div>
<div class="summary-metrics">
<div>
<strong>${duration(requiredMinutes())}</strong>
<small>${esc(t('theoryIncluded'))}</small>
</div>
<div>
<strong>${lessons()}</strong>
<small>${esc(t('lessonsUnit'))}</small>
</div>
</div>`:`<p class="hint">${esc(t('chooseFirst'))}</p>`}</div>
<p class="saved-line">${icon(storageAvailable?'check':'info')}${esc(t(storageAvailable?'saved':'storageOff'))}</p>
</aside>`;
}
function render({focusId, focusHeading=false}={}) {
  save();
  const plan=state.step===4?buildPlan(state):null;
  if (plan?.error) { error=plan.error; state.step=plan.error==='chooseSubjects'?1:2; save(); }
  document.documentElement.lang=state.locale;
  document.title=t('title');
  document.querySelector('meta[name="description"]').content=t('description');
  let canonical=document.querySelector('link[rel="canonical"]');
  if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.append(canonical);}
  canonical.href='https://planning.dragi.app/';
  root.innerHTML=`<a class="skip" href="#page-heading">${esc(t('skip'))}</a>${IS_LOCAL?`<div class="preview-bar">${esc(t('preview'))}</div>`:''}<div class="header-border">
<header class="header">
<a class="brand" href="https://progress.dragi.app/${state.locale}/" aria-label="Dragi Progress">
<img src="assets/logo.png" alt="Dragi">
<span class="brand-divider">
</span>
<span class="product-label">${esc(t('product'))}</span>
</a>
<div class="header-right">
<a class="progress-link" href="https://progress.dragi.app/${state.locale}/">${esc(t('progress'))}${icon('external')}</a>

</div>
</header>
</div>
<div class="shell">
<nav aria-label="${esc(t('stepLabel'))}">
<ol class="steps">${['subjectsStep','datesStep','rhythmStep','planStep'].map((key,i)=>`<li>
<button type="button" class="${i+1<state.step?'complete':''}" data-action="step" data-value="${i+1}" ${i+1===state.step?'aria-current="step"':''} ${i+1>state.step?'disabled':''}>
<span class="step-number">${i+1<state.step?'✓':'0'+(i+1)}</span>
<span>${esc(t(key))}</span>
</button>
</li>`).join('')}</ol>
</nav>${banner?`<p class="message" role="status">${esc(t(banner))}</p>`:''}${!storageAvailable?`<p class="message error" role="status">${esc(t('storageOff'))}</p>`:''}<div class="layout ${state.step===4?'result-layout':''}">
<main class="main">${state.step===4?resultPage(plan):`<form id="planner-form" novalidate>${state.step===1?subjectsPage():state.step===2?datesPage():rhythmPage()}${error?`<p class="message error" role="alert" id="form-error" tabindex="-1">${esc(t(error))}</p>`:''}${actions()}</form>`}</main>${state.step<4?aside():''}</div>
<footer class="footer">
<p>${esc(t('footer'))}</p>
<a href="https://progress.dragi.app/${state.locale}/">Dragi Progress ↗</a>
</footer>
</div>${toast?`<div class="toast" role="status">${esc(t(toast))}</div>`:''}`;
  if(focusHeading) { document.querySelector('#page-heading')?.focus({preventScroll:true}); window.scrollTo({top:0,behavior:'instant'}); }
  else if(focusId) document.getElementById(focusId)?.focus({preventScroll:true});
}
function track(name,parameters){if(!IS_LOCAL&&typeof globalThis.gtag==='function')globalThis.gtag('event',name,parameters);}
function go(step) { state.step=step; banner=''; error=''; resetOpen=false; render({focusHeading:true}); track('onboarding_step_view',{step_key:['subjects','dates','rhythm','calendar'][step-1],step_index:step}); }
function notify(key) { toast=key; clearTimeout(toastTimer); render(); toastTimer=setTimeout(()=>{toast='';document.querySelector('.toast')?.remove();},6500); }
function clearOverrides() { state.overrides={}; }
root.addEventListener('submit',event=>{
  event.preventDefault();
  error=validate(state,state.step);
  if(error){render();document.querySelector('#form-error')?.focus();return;}
  if(state.step===2&&state.paceMode==='recommended'){const recommendation=recommendRhythm(state);if(recommendation)state=recommendation.state;}
  if(state.step===3) week=monday(state.start);
  go(Math.min(4,state.step+1));
});
root.addEventListener('change',event=>{
  const el=event.target; const focusId=el.id;
  if(el.name==='start'||el.name==='end') { state[el.name]=validDate(el.value)?el.value:'';clearOverrides(); }
  else if(el.name==='reserve' && [0,7,14,21,28].includes(Number(el.value))) {state.reserve=Number(el.value);clearOverrides();}
  else if(['pause','reminder'].includes(el.name) && [0,5,10,15].includes(Number(el.value))) {state[el.name]=Number(el.value);if(el.name==='pause'){clearOverrides();state.paceMode='custom';}}
  else if(el.dataset.day!==undefined) {
    state.paceMode='custom';
    const day=state.days[Number(el.dataset.day)];
    if(el.name==='day') day.enabled=el.checked;
    else if(el.name==='dayTime') day.start=el.value;
    else if(el.name==='dayMinutes') day.minutes=Number(el.value);
    clearOverrides();
  } else if(el.dataset.slot && state.selected.includes(el.value)) state.overrides[el.dataset.slot]=el.value;
  error='';banner='';render({focusId});
});
root.addEventListener('click',event=>{
  const storeLink=event.target.closest('[data-store]');
  if(storeLink)track(storeLink.dataset.store==='apple'?'download_appstore':'download_googleplay',{event_category:'onboarding',step_key:'calendar',step_index:4});
  const button=event.target.closest('[data-action]');
  if(!button||button.disabled)return;
  const action=button.dataset.action;
  if(action==='subject') {
    const id=button.dataset.subject;
    state.selected=state.selected.includes(id)?state.selected.filter(s=>s!==id):SUBJECTS.filter(s=>s===id||state.selected.includes(s));
    if(!state.selected.includes(state.priority))state.priority='';
    clearOverrides();
  }
  else if(action==='session') {state.session=Number(button.dataset.value);state.paceMode='custom';clearOverrides();}
  else if(action==='daysPreset') {const days={weekdays:[0,1,2,3,4],threeDays:[0,2,4],weekend:[5,6]}[button.dataset.value];state.days.forEach((d,i)=>{d.enabled=days.includes(i);});state.paceMode='custom';clearOverrides();}
  else if(action==='profile') {const profile=recommendRhythms(state).find(p=>p.id===button.dataset.value&&p.feasible);if(profile)state=profile.state;}
  else if(action==='examYear'||action==='may20'||action==='nextExamYear'){const year=action==='nextExamYear'?examYears()[1].year:action==='may20'?state.examYear:Number(button.dataset.value);if(examYears().some(option=>option.year===year)){state.examYear=year;state.end=`${year}-05-20`;clearOverrides();}if(action==='nextExamYear')return go(2);}
  else if(action==='back')return go(state.step-1);
  else if(action==='step')return go(Number(button.dataset.value));
  else if(action==='rhythm')return go(3);
  else if(action==='view')view=button.dataset.value;
  else if(action==='previousWeek')week=addDays(week,-7);
  else if(action==='nextWeek')week=addDays(week,7);
  else if(action==='reset')resetOpen=true;
  else if(action==='cancelReset')resetOpen=false;
  else if(action==='confirmReset') {const locale=state.locale;state=defaultState();state.locale=locale;week=monday(state.start);return go(1);}
  else if(action==='print')return window.print();
  else if(action==='download') {
    try {
      const file=makeICS(state,names(),t('sessionDescription'),new Date(),t('review'));
      track('calendar_download',{step_key:'calendar',step_index:4});
      const url=URL.createObjectURL(new Blob([file],{type:'text/calendar;charset=utf-8'}));
      const link=document.createElement('a');link.href=url;link.download=`dragi-nmt-${state.start}.ics`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);notify('downloaded');
    } catch {notify('exportError');}
    return;
  }
  error='';banner='';render({focusId:button.id});
});
render();
