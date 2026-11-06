import {WORKLOAD} from './workload.mjs';
export const SUBJECTS = ['ukrainian', 'math', 'history', 'english', 'literature', 'geography', 'chemistry', 'biology', 'physics', 'german'];
export const LOCALES = ['uk'];
export const SESSION_OPTIONS = [20, 25, 40, 50];
export const pad = value => String(value).padStart(2, '0');
export function dateKey(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
export function validDate(value) {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && dateKey(date) === value;
}
export function addDays(value, days) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}
export function addMonths(value, months) {
  const date = new Date(`${value}T12:00:00`);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, last));
  return dateKey(date);
}
export function monday(value) {
  const day = new Date(`${value}T12:00:00`).getDay();
  return addDays(value, -((day + 6) % 7));
}
export function timeMinutes(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return NaN;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}
export function timeText(minutes) { return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`; }
export function examYears(now = new Date()) {
  const year=now.getFullYear(),today=dateKey(now);
  const upcoming=`${year}-05-20`>today?year:year+1;
  return [upcoming,upcoming+1].map((value,index)=>({year:value,label:index?'Через рік':'Найближче НМТ',date:`${value}-05-20`,available:true}));
}
export function defaultState(now = new Date()) {
  const start = dateKey(now);
  const exam=examYears(now).find(option=>option.available);
  return {version: 3, workload: WORKLOAD.version, locale: 'uk', step: 1, selected: [], priority: '', examYear:exam.year, start, end:exam.date, reserve:14, session:25, pause:5, reminder:10, paceMode:'recommended',preferredProfile:'balanced',
    days: Array.from({length: 7}, (_, i) => ({enabled: [0, 1, 3, 4].includes(i), start: i < 5 ? '17:00' : '10:00', minutes: 60})), overrides: {}};
}
export function restoreState(raw, now = new Date()) {
  const fallback = defaultState(now);
  if (!raw) return {state:fallback,status:'new'};
  try {
    const s = JSON.parse(raw);
    if (!s || ![2,3].includes(s.version) || !['uk','en','de','es'].includes(s.locale) || !Number.isInteger(s.step) || s.step < 1 || s.step > 4 ||
        !Array.isArray(s.selected) || s.selected.length > SUBJECTS.length || s.selected.some(id => !SUBJECTS.includes(id)) || new Set(s.selected).size !== s.selected.length ||
        (s.priority !== '' && !s.selected.includes(s.priority)) || !validDate(s.start) || !validDate(s.end) ||
        ![0, 7, 14, 21, 28].includes(s.reserve) || !SESSION_OPTIONS.includes(s.session) || ![0, 5, 10, 15].includes(s.pause) || ![0, 5, 10, 15].includes(s.reminder) ||
        !Array.isArray(s.days) || s.days.length !== 7 || s.days.some(d => !d || typeof d.enabled !== 'boolean' || !Number.isFinite(timeMinutes(d.start)) || !Number.isInteger(d.minutes) || d.minutes < 20 || d.minutes > 240)) return {state: fallback, status: 'invalid'};
    const overrides = {};
    for (const [key, value] of Object.entries(s.overrides || {}).slice(0, 100)) {
      if (/^20\d{2}-\d{2}-\d{2}-[0-9]{1,2}$/.test(key) && s.selected.includes(value)) overrides[key] = value;
    }
    if(s.version===3 && (!Number.isInteger(s.examYear)||Number(s.end.slice(0,4))!==s.examYear||!['recommended','custom'].includes(s.paceMode)||(s.preferredProfile!==undefined&&!['balanced','steady','compact','daily'].includes(s.preferredProfile))))return {state:fallback,status:'invalid'};
    const migrated=s.version===2;
    const state = {...fallback, locale:'uk', step:s.step, selected:s.selected, priority:s.priority, start:s.start, end:migrated?fallback.end:s.end, examYear:migrated?fallback.examYear:s.examYear, reserve:s.reserve, session:s.session, pause:s.pause, reminder:s.reminder, paceMode:migrated?'recommended':s.paceMode,preferredProfile:s.preferredProfile||'balanced', days:s.days.map(d=>({enabled:d.enabled,start:d.start,minutes:d.minutes})), overrides:migrated?{}:overrides};
    const obsoleteYear=!examYears(now).some(option=>option.year===state.examYear);
    if(obsoleteYear){state.examYear=fallback.examYear;state.end=fallback.end;state.step=Math.min(state.step,2);state.overrides={};}
    if(migrated)state.step=Math.min(state.step,2);
    if (s.workload !== WORKLOAD.version) {
      state.step = Math.min(state.step, 2);
      state.overrides = {};
    }
    // Expired drafts remain editable, but cannot skip the date review.
    if (state.end < dateKey(now) || state.start < dateKey(now)) state.step = Math.min(state.step, 2);
    if (!state.selected.length) state.step = 1;
    return {state,status:migrated?'examFlowChanged':obsoleteYear?'examYearsChanged':s.workload===WORKLOAD.version?'restored':'workloadChanged'};
  } catch { return {state: fallback, status: raw ? 'invalid' : 'new'}; }
}
export function validate(state, through = 3, now = new Date()) {
  if (!state.selected.length) return 'chooseSubjects';
  if (through < 2) return null;
  if (!validDate(state.start) || !validDate(state.end)) return 'dateInvalid';
  if (state.start < dateKey(now)) return 'startPast';
  if (state.end <= state.start) return 'dateOrder';
  if (Number(state.end.slice(0,4))!==state.examYear || !examYears(now).some(option=>option.year===state.examYear)) return 'examYearInvalid';
  if (state.end > addMonths(state.start, 24)) return 'dateLimit';
  if (addDays(state.end, -state.reserve-1) < state.start) return 'reserveTooLong';
  if (through < 3) return null;
  if (!state.days.some(d => d.enabled)) return 'chooseDays';
  if (state.days.some(d => d.enabled && (!Number.isFinite(timeMinutes(d.start)) || !Number.isInteger(d.minutes) || d.minutes < 20 || d.minutes > 240))) return 'windowSmall';
  if (state.days.some(d => d.enabled && timeMinutes(d.start) + d.minutes > 1440)) return 'dayOverflow';
  return null;
}
export function weeklySlots(state) {
  const plan = buildPlan(state);
  const start = monday(state.start);
  return plan.events.filter(e => e.date >= start && e.date <= addDays(start, 6));
}
export function nativeMinutes(subject, preferred, available, remaining = Infinity) {
  const course = WORKLOAD.subjects[subject];
  const values = [];
  for (let value = course.min; value <= Math.min(course.max, preferred, available); value += course.step) values.push(value);
  return values.find(value => value >= remaining) || values.at(-1) || 0;
}
function courseSchedule(state, until, now) {
  const remaining = Object.fromEntries(state.selected.map(id => [id, WORKLOAD.subjects[id].minutes]));
  const events = [];
  const today = dateKey(now);
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  let finish = null;
  for (let date = state.start; date <= until; date = addDays(date, 1)) {
    const day = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
    const window = state.days[day];
    if (!window.enabled) continue;
    const limit = timeMinutes(window.start) + window.minutes;
    let previous = '';
    for (let cursor = timeMinutes(window.start), index = 0; cursor < limit; index++) {
      const choices = state.selected.filter(id => remaining[id] > 0 && nativeMinutes(id, state.session, limit - cursor));
      let candidates = [...choices];
      if (!candidates.length) break;
      const alternative = candidates.filter(id => id !== previous);
      if (alternative.length) candidates = alternative;
      candidates.sort((a,b) => (1 - remaining[a] / WORKLOAD.subjects[a].minutes) - (1 - remaining[b] / WORKLOAD.subjects[b].minutes));
      const key = `${date}-${index}`;
      const override = state.overrides[key];
      const subject = state.selected.includes(override) && remaining[override] > 0 && nativeMinutes(override, state.session, limit - cursor) ? override : candidates[0];
      const minutes = nativeMinutes(subject, state.session, limit - cursor, remaining[subject]);
      if (!(date === today && cursor <= currentMinute)) {
        const credit = Math.min(minutes, remaining[subject]);
        remaining[subject] -= credit;
        const consumed=WORKLOAD.subjects[subject].minutes-remaining[subject]-credit;
        const sections=sectionParts(subject,consumed,credit);
        events.push({key,date,day,subject,start:cursor,end:cursor+minutes,minutes,credit,kind:'course',choices,sections});
      }
      previous = subject;
      cursor += minutes + state.pause;
      if (state.selected.every(id => remaining[id] <= 0)) { finish = date; break; }
    }
    if (finish) break;
  }
  return {events, remaining, finish};
}
export function buildPlan(state, now = new Date(), options={}) {
  const error = validate(state, 3, now);
  if (error) return {error, events: [], missing: [], minutes: 0, required: 0, remaining: {}, feasible: false};
  const studyLast=addDays(state.end,-1);
  const courseEnd=addDays(studyLast,-state.reserve);
  const course = courseSchedule(state, courseEnd, now);
  const events = [...course.events];
  const missing = state.selected.filter(id => course.remaining[id] > 0);
  const required = state.selected.reduce((sum,id) => sum + WORKLOAD.subjects[id].minutes, 0);
  const today = dateKey(now);
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  let rotation = 0;
  for (let date = addDays(courseEnd, 1); date <= studyLast; date = addDays(date, 1)) {
    const day = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
    const window = state.days[day];
    if (!window.enabled) continue;
    const limit = timeMinutes(window.start) + window.minutes;
    for (let cursor = timeMinutes(window.start), index = 0; cursor < limit; index++) {
      const key = `${date}-${index}`;
      const subject = state.selected.includes(state.overrides[key]) ? state.overrides[key] : state.selected[rotation++ % state.selected.length];
      const minutes = nativeMinutes(subject, state.session, limit - cursor);
      if (!minutes) break;
      if (!(date === today && cursor <= currentMinute)) events.push({key, date, day, subject, start: cursor, end: cursor + minutes, minutes, credit: 0, kind: 'review'});
      cursor += minutes + state.pause;
    }
  }
  const forecast = missing.length && options.forecast!==false ? courseSchedule(state, addMonths(state.start, 24), now).finish : course.finish;
  return {error: null,events,missing,required,courseEnd,studyLast,finish:course.finish,forecast,
    remaining: course.remaining, deficit: Object.values(course.remaining).reduce((a,b) => a+b, 0), feasible: !missing.length,
    minutes: events.reduce((sum, e) => sum + e.minutes, 0), reviewMinutes: events.filter(e => e.kind === 'review').reduce((sum,e) => sum+e.minutes,0)};
}
export function recommendRhythm(state, now = new Date()) {
  const options=recommendRhythms(state,now);
  return options.find(option=>option.id===state.preferredProfile&&option.feasible)||options.find(option=>option.feasible)||null;
}
// This models the app's daily goal, not the measured duration of a lesson.
// NMT history 40 -> 2 is owner-observed; verify other thresholds in the app.
export function nativeSetup(state, now = new Date()) {
  const error = validate(state, 3, now);
  if (error) return {error, courses: [], compatible: false};
  const courseEnd = addDays(state.end, -state.reserve - 1);
  const weekdays = state.days.flatMap((day, i) => day.enabled ? [i] : []);
  const dates = [];
  for (let date = state.start; date <= courseEnd; date = addDays(date, 1)) {
    const day = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
    if (weekdays.includes(day) && !(date === dateKey(now) && timeMinutes(state.days[day].start) <= now.getHours() * 60 + now.getMinutes())) dates.push(date);
  }
  const unit = WORKLOAD.nativeSetup.nominalMinutesPerLesson;
  const courses = state.selected.map(subject => {
    const course = WORKLOAD.subjects[subject];
    const requiredDailyLessons = dates.length ? Math.ceil(course.lessons / dates.length) : null;
    const values = [];
    for (let minutes = course.min; minutes <= course.max; minutes += course.step) values.push(minutes);
    const maxMinutes = values.at(-1);
    const maxDailyLessons = Math.ceil(maxMinutes / unit);
    const candidates = requiredDailyLessons ? values.filter(m => Math.ceil(m / unit) >= requiredDailyLessons) : [];
    // Prefer the unambiguous 20-minute boundary when the current grid permits it.
    const minutes = candidates.includes(requiredDailyLessons * unit) ? requiredDailyLessons * unit : candidates.at(-1);
    const compatible = Number.isFinite(minutes);
    const expectedDailyLessons = compatible ? Math.ceil(minutes / unit) : maxDailyLessons;
    const finish = dates[Math.ceil(course.lessons / expectedDailyLessons) - 1] || null;
    return {subject, name: WORKLOAD.nativeSetup.courseNames[subject], courseId:course.courseId,
      lessons:course.lessons, weekdays:[...weekdays], studyDates:dates.length, courseEnd,
      requiredDailyLessons, minutes:compatible?minutes:null, maxMinutes,maxDailyLessons,
      expectedDailyLessons, compatible, finish,
      lessonDeficit:Math.max(0,course.lessons-dates.length*maxDailyLessons),
      requiredFieldMinutes:requiredDailyLessons?requiredDailyLessons*unit:null};
  });
  return {error:null,courseEnd,weekdays,studyDates:dates.length,courses,compatible:courses.every(c=>c.compatible)};
}
export const PACE_PROFILES=[
  {id:'balanced',name:'Збалансовано',description:'Два вільні дні на тиждень',weekdays:[0,1,2,3,4]},
  {id:'steady',name:'Коротше, але частіше',description:'Менше часу на день',weekdays:[0,1,2,3,4,5]},
  {id:'compact',name:'Більше вільних днів',description:'Три навчальні дні на тиждень',weekdays:[0,2,4]},
  {id:'daily',name:'Щодня',description:'Коли до іспиту небагато часу',weekdays:[0,1,2,3,4,5,6]}
];
export function recommendRhythms(state,now=new Date()) {
  if(validate(state,2,now))return [];
  return PACE_PROFILES.map(profile=>{
    for(const minutes of [20,30,45,60,90,120,150,180,240]){
      const candidate={...state,paceMode:'recommended',preferredProfile:profile.id,overrides:{},days:state.days.map((d,i)=>({...d,enabled:profile.weekdays.includes(i),minutes}))};
      const plan=buildPlan(candidate,now,{forecast:false});
      if(plan.feasible)return {...profile,feasible:true,minutes,days:profile.weekdays.length,state:candidate,finish:plan.finish};
    }
    return {...profile,feasible:false};
  });
}
export function sectionParts(subject,offset,minutes) {
  let boundary=0;
  const parts=[];
  for(const section of WORKLOAD.subjects[subject].sections){
    const overlap=Math.max(0,Math.min(offset+minutes,boundary+section.minutes)-Math.max(offset,boundary));
    if(overlap)parts.push({id:section.id,name:section.name,minutes:overlap});
    boundary+=section.minutes;
  }
  return parts;
}
export function subjectMilestones(state,plan) {
  const span=Math.max(1,(new Date((plan.finish||plan.courseEnd)+'T12:00:00Z')-new Date(state.start+'T12:00:00Z'))/86400000+1);
  return state.selected.map(subject=>{
    const course=WORKLOAD.subjects[subject],events=plan.events.filter(e=>e.subject===subject&&e.kind==='course');
    let cumulative=0;
    const sections=course.sections.map(section=>{
      const from=cumulative;cumulative+=section.minutes;
      let covered=0,start=null,finish=null;
      for(const event of events){
        const next=covered+event.credit;
        if(section.minutes && next>from && covered<cumulative){if(!start)start=event.date;if(next>=cumulative)finish=event.date;}
        covered=next;
      }
      return {...section,start,finish,fraction:course.minutes?section.minutes/course.minutes:0};
    });
    return {subject,minutes:course.minutes,lessons:course.lessons,sections,finish:sections.filter(s=>s.minutes).at(-1)?.finish||null,weeklyMinutes:Math.ceil(events.reduce((sum,e)=>sum+e.minutes,0)*7/span),scheduled:course.minutes-(plan.remaining[subject]||0),deficit:plan.remaining[subject]||0};
  });
}
export function escapeICS(value) { return String(value).replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll(';', '\\;').replaceAll(',', '\\,').replaceAll('\r', ''); }
export function foldLine(value) {
  const lines = [];
  let line = '', bytes = 0;
  for (const char of value) {
    const length = new TextEncoder().encode(char).length;
    if (bytes + length > 75) { lines.push(line); line = ' '; bytes = 1; }
    line += char; bytes += length;
  }
  lines.push(line);
  return lines.join('\r\n');
}
export function makeICS(state, labels, description, now = new Date(), reviewLabel = '') {
  const plan = buildPlan(state, now);
  if (plan.error || !plan.events.length || plan.missing.length) throw new Error(plan.error || 'incompletePlan');
  const stamp = now.toISOString().replaceAll(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dragi//Planning v2//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Dragi Planning'];
  for (const event of plan.events) {
    const date = event.date.replaceAll('-', '');
    const time = value => timeText(value).replace(':', '') + '00';
    // Floating local wall time: recurring study stays at the chosen local hour across DST.
    const endDate = event.end === 1440 ? addDays(event.date, 1).replaceAll('-', '') : date;
    const end = event.end === 1440 ? '000000' : time(event.end);
    const content=event.sections?.map(s=>s.name).join(' → ');
    lines.push('BEGIN:VEVENT', `UID:dragi-v3-${event.key}-${event.subject}-${event.start}-${event.minutes}@planning.dragi.app`, `DTSTAMP:${stamp}`, `DTSTART:${date}T${time(event.start)}`, `DTEND:${endDate}T${end}`, `SUMMARY:${escapeICS('Dragi · ' + labels[event.subject] + (event.kind === 'review' ? ' · ' + reviewLabel : ''))}`, `DESCRIPTION:${escapeICS(description+(content?'\n'+content:''))}`, 'TRANSP:OPAQUE');
    if (state.reminder) lines.push('BEGIN:VALARM', `TRIGGER:-PT${state.reminder}M`, 'ACTION:DISPLAY', `DESCRIPTION:${escapeICS(labels[event.subject])}`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
