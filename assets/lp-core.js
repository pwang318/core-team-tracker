
var STORAGE_KEY="ct_agents_v3";
var LPS=["Gavin","Jordan","Karen","Osgood","Said","Isaak"];
var RMS=["Amanda","Nyny"];
var agentRmOwners={};
function assignmentKey(name){return (name||"").trim().toLowerCase().replace(/\s+/g," ");}
function getRmOwner(name){return agentRmOwners[assignmentKey(name)]||"";}
function rmOwnerBadge(name){var o=getRmOwner(name)||"Unassigned";return '<span class="rm-owner-tag" style="font-size:10.5px;font-weight:700;color:#071B37;background:#EAF7FB;border:1px solid #CDEAF2;border-radius:999px;padding:2px 7px;white-space:nowrap">RM: '+escHtml(o)+'</span>';}
var LP_COLORS={Gavin:"#3D4E68",Karen:"#3D4E68",Osgood:"#3D4E68",Jordan:"#3D4E68",Said:"#3D4E68",Isaak:"#3D4E68"};
var WEEKLY_TARGET=15;
var TODAY=new Date();TODAY.setHours(0,0,0,0);
var CUTOFF=new Date(TODAY);CUTOFF.setDate(TODAY.getDate()-90);

function localDateStr(d){var y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+dd;}
function getWeekKey(d){
  var day=d.getDay(); // 0=Sun,1=Mon,...,6=Sat
  var diff=day===0?-6:1-day; // days to subtract to get to Monday
  var mon=new Date(d.getFullYear(),d.getMonth(),d.getDate()+diff);
  return localDateStr(mon);
}
function getLastWeekKey(d){var dt=new Date(d);dt.setDate(dt.getDate()-7);return getWeekKey(dt);}
function getWeekLabel(k){var mon=new Date(k+'T12:00:00'),sun=new Date(mon);sun.setDate(mon.getDate()+6);var o={month:'short',day:'numeric'};return 'Week of '+mon.toLocaleDateString('en-US',o)+' - '+sun.toLocaleDateString('en-US',o);}
function fmt(d){if(!d)return'--';return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'});}
function fmtShort(d){if(!d)return'--';return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'numeric',day:'numeric'});}
function mostRecent(a){return[a[3],a[4],a[5],a[6]].filter(Boolean).sort().reverse()[0]||null;}
function mostRecentWithType(a){
  var pairs=[
    {date:a[3],label:"Lead in Velocify",icon:"🎯"},
    {date:a[4],label:"File started",icon:"📄"},
    {date:a[5],label:"Contract",icon:"✍️"},
    {date:a[6],label:"Close",icon:"🏆"}
  ].filter(function(p){return!!p.date;}).sort(function(x,y){return y.date.localeCompare(x.date);});
  return pairs.length?pairs[0]:null;
}
// v29: shared cross-system name key. Velocify may omit punctuation/middle initials
// (e.g. "SHAYNE BOYD") while the relationship roster contains "Shayne D. Boyd".
function ctAgentNameKey(name){
  var parts=String(name||"").toLowerCase().replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim().split(" ").filter(Boolean);
  return parts.filter(function(part,idx){return !(part.length===1&&idx>0&&idx<parts.length-1);}).join(" ");
}
var VELOCIFY_MATCH={};
function rebuildVelocifyMatch(){
  VELOCIFY_MATCH={};
  Object.keys(VELOCIFY_SEED||{}).forEach(function(raw){
    var d=VELOCIFY_SEED[raw]||{};
    var keys=[String(raw||"").trim().toUpperCase(),ctAgentNameKey(raw)].filter(Boolean);
    keys.forEach(function(k){
      var prev=VELOCIFY_MATCH[k];
      if(!prev||String(d.last_lead_date||"")>String(prev.last_lead_date||""))VELOCIFY_MATCH[k]=d;
    });
  });
}
function getVelocifyForAgent(name){
  var raw=String(name||"").trim();
  return (VELOCIFY_SEED&&VELOCIFY_SEED[raw])||(VELOCIFY_SEED&&VELOCIFY_SEED[raw.toUpperCase()])||VELOCIFY_MATCH[ctAgentNameKey(raw)]||null;
}
function syncLiveVelocifyDatesIntoAgents(){
  rebuildVelocifyMatch();
  (agents||[]).forEach(function(a){
    var vel=getVelocifyForAgent(a[0]);
    var live=vel&&vel.last_lead_date?String(vel.last_lead_date).slice(0,10):null;
    if(live&&(!a[3]||live>a[3]))a[3]=live;
  });
}
function isActive(a){var d=[a[3],a[6]].filter(Boolean).sort().reverse()[0]||null;return d?new Date(d+'T12:00:00')>=CUTOFF:false;}
function lpOutcomeKey(outcome){return String(outcome||"").trim().toLowerCase();}
function lpHasLiveConnectionLog(log){
  if(!log)return false;
  var o=lpOutcomeKey(log.outcome);
  return o==="answered"||o==="in person"||o==="text conversation"||o==="text reply";
}
function lpWorkflowCompleteLog(log){
  if(!log)return false;
  var o=lpOutcomeKey(log.outcome);
  // Weekly outreach is complete only after a live connection OR the full no-answer workflow.
  // A voicemail by itself or a one-way text by itself does NOT count toward the weekly goal.
  return o==="answered"||o==="in person"||o==="text conversation"||o==="text reply"||o==="vm + text"||o==="voicemail + text";
}
function calledThisWeek(name){var log=callLogs[name];return !!(log&&log.week_key===weekKey&&lpWorkflowCompleteLog(log));}
function attemptedThisWeek(name){var log=callLogs[name];return !!(log&&log.week_key===weekKey);}
function lpDays(name){var log=callLogs[name];if(!log||!log.call_date)return null;var dt=new Date(log.call_date+'T12:00:00');dt.setHours(0,0,0,0);return Math.floor((TODAY-dt)/86400000);}
function isPriority(a){return a[7]===true;}
function isMonday(){return TODAY.getDay()===1;}

function getLpCallsThisWeek(lp){return Object.values(callLogs).filter(function(l){return l.lp===lp&&l.week_key===weekKey&&lpWorkflowCompleteLog(l);}).length;}
function getLpCallsLastWeek(lp){return Object.values(lastWeekLogs).filter(function(l){return l.lp===lp&&l.week_key===lastWeekKey&&lpWorkflowCompleteLog(l);}).length;}
function getLpPctThisWeek(lp){return Math.min(100,Math.round(getLpCallsThisWeek(lp)/WEEKLY_TARGET*100));}
function getLpPctLastWeek(lp){return Math.min(100,Math.round(getLpCallsLastWeek(lp)/WEEKLY_TARGET*100));}

// ─── INCOMPLETE CALLS CARRYOVER SYSTEM ───
function getLpIncompleteFromLastWeek(lp){
  var lastWeekCalls=getLpCallsLastWeek(lp);
  return Math.max(0,WEEKLY_TARGET-lastWeekCalls);
}
function getLpTotalTargetThisWeek(lp){
  var raw=WEEKLY_TARGET+getLpIncompleteFromLastWeek(lp);
  // Cap at the LP's active agent count - can't call more unique agents than exist
  var activeCount=agents.filter(function(a){return a[2]===lp&&isActive(a)&&(calledThisWeek(a[0])||!lpRmCoordinationHold(a));}).length;
  return Math.min(raw,Math.max(WEEKLY_TARGET,activeCount));
}

var SB_URL="https://uclucbdkjqyqdvifyptx.supabase.co";
// ── Display-only name formatting (does NOT touch stored agent_name — matching/identity always
// uses the raw stored value; this only affects what's rendered on screen) ─────────────────────
// A Power BI import can leave a name ALL CAPS ("MEGAN LYNCH"); a human-entered or manually
// corrected name is left exactly as typed, since it may carry real, intentional capitalization
// (McMahon, O'Connor, De La Riva) that a blind title-case would mangle. The rule: only reformat
// a name that is ENTIRELY uppercase (a strong signal it's raw import data, not something a
// person typed) — anything already mixed-case is assumed to be a real human-entered/verified
// name and is left untouched.
function displayNameWithoutOverride(raw){
  if(!raw)return raw;
  const s=String(raw).trim();
  if(!s)return s;
  const suffixes={"jr":"Jr.","jr.":"Jr.","sr":"Sr.","sr.":"Sr.","ii":"II","iii":"III","iv":"IV","v":"V"};
  const lowerParticles=new Set(["de","del","de la","da","di","du","van","von"]);
  const capPart=part=>{
    if(!part)return part;
    const lead=(part.match(/^[^A-Za-z0-9]*/)||[""])[0];
    const trail=(part.match(/[^A-Za-z0-9.]*$/)||[""])[0];
    let core=part.slice(lead.length,part.length-trail.length).toLowerCase();
    if(!core)return part;
    if(suffixes[core])return lead+suffixes[core]+trail;
    if(core==="&")return part;
    if(/^[a-z](\.[a-z])+\.?$/i.test(core))return lead+core.toUpperCase()+trail;
    if(core.includes("-"))return lead+core.split("-").map(capPart).join("-")+trail;
    if(core.includes("'"))return lead+core.split("'").map(capPart).join("'")+trail;
    if(core.startsWith("mc")&&core.length>3)core="Mc"+core.charAt(2).toUpperCase()+core.slice(3);
    else if(core.startsWith("mac")&&core.length>4)core="Mac"+core.charAt(3).toUpperCase()+core.slice(4);
    else core=core.charAt(0).toUpperCase()+core.slice(1);
    return lead+core+trail;
  };
  return s.split(/\s+/).map(capPart).join(" ");
}
function displayName(raw){
  if(!raw)return raw;
  const s=String(raw).trim();
  const corrected=(typeof ctDisplayNames!=="undefined"&&ctDisplayNames[(s||"").toLowerCase()])||null;
  if(corrected)return displayNameWithoutOverride(corrected);
  return displayNameWithoutOverride(s);
}
// ── Meaningful Contact classification (shared definition — see identical config in the RM
// Tracker) ───────────────────────────────────────────────────────────────────────────────────
// CORRECTED DEFAULT (was: blank outcome counted as meaningful — flagged as wrong): a blank/unset
// outcome is now NOT meaningful UNLESS the activity type itself proves real contact happened (a
// logged meeting is evidence of contact on its own, independent of a separate outcome field).
var NOT_MEANINGFUL_RM_OUTCOMES=["left voicemail","no answer"];
var NOT_MEANINGFUL_LP_OUTCOMES=["left vm","sent follow-up text"];
var MEETING_ACT_TYPES=["Partner Meeting","Break Breads","Strategic Partner Meeting","Channel Meeting","Team / Office Presentation","Retention Meeting","New Realtor Meeting"];
function isMeaningfulOutcome(outcome,list,actType){
  if(actType&&MEETING_ACT_TYPES.indexOf(actType)>=0)return true;
  var o=(outcome||"").trim().toLowerCase();
  if(!o)return false;
  return list.indexOf(o)<0;
}
var SB_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjbHVjYmRranF5cWR2aWZ5cHR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0OTUyMTMsImV4cCI6MjA5NjA3MTIxM30.VnqWcFT1WLQwCJxSdEIzIgOvETaOQly2IQxht-9uI7E";
var STORAGE_KEY="ct_agents_v3";
var LPS=["Gavin","Jordan","Karen","Osgood","Said","Isaak"];
var LP_COLORS={Gavin:"#3D4E68",Karen:"#3D4E68",Osgood:"#3D4E68",Jordan:"#3D4E68",Said:"#3D4E68",Isaak:"#3D4E68"};
var WEEKLY_TARGET=15;
var TODAY=new Date();TODAY.setHours(0,0,0,0);
var CUTOFF=new Date(TODAY);CUTOFF.setDate(TODAY.getDate()-90);




















// ─── INCOMPLETE CALLS CARRYOVER SYSTEM ───



var weekKey=getWeekKey(TODAY);
var lastWeekKey=getLastWeekKey(TODAY);
var agents=[],callLogs={},lastWeekLogs={},lpOpenRmFlags={},currentUser=null,noteTimers={},contactCache={},editingLpContact=null,pendingNote={};
var ctInactiveRosterNames=new Set();
var ctNurtureRosterNames=new Set();
var ctNurtureRosterMeta={};
var ctDisplayNames={};
function ctRosterRemoved(name){return ctInactiveRosterNames.has(String(name||"").trim().toLowerCase());}
function ctRosterNurture(name){return ctNurtureRosterNames.has(String(name||"").trim().toLowerCase());}
// LP action eligibility is intentionally narrower than relationship visibility: RM Nurture agents
// stay in ownership/history/admin, but leave recurring LP call, connection, overdue and Face Time queues.
function ctRosterEligible(a){return !!a && !ctRosterRemoved(a[0]) && !ctRosterNurture(a[0]);}

// Live Current Relationship Roster exclusion set — shared by co-marketing selection and any
// other place that still reads from the legacy `agents` array (which itself carries no
// relationship_status field, so this cross-reference is needed wherever that array is used to
// decide who's eligible for active work). Best-effort: if this hasn't loaded yet when a screen
// first renders, nothing is excluded — the same tolerance already used elsewhere for admin views.
async function loadInactiveRosterNames(){
  // A removed agent can be represented by either the current relationship_status=inactive flag
  // or the legacy agent_assignments lp=__REMOVED__ sentinel. Union both so Power BI uploads
  // can never accidentally resurrect a removed agent, even if one of the two database fields
  // is unavailable or was written by an older tracker version.
  try{
    var results=await Promise.all([
      sbFetch("GET","agent_profiles?select=agent_name,display_name,relationship_status,lp_outreach_status,nurture_reason,next_rm_followup&limit=5000")
        .catch(function(){return sbFetch("GET","agent_profiles?select=agent_name,display_name,relationship_status&limit=5000").catch(function(){return sbFetch("GET","agent_profiles?select=agent_name,display_name&limit=5000").catch(function(){return[];});});}),
      sbFetch("GET","agent_assignments?select=agent_name,lp&limit=5000").catch(function(){return[];})
    ]);
    var rows=results[0]||[],assignments=results[1]||[];
    ctInactiveRosterNames=new Set();ctNurtureRosterNames=new Set();ctNurtureRosterMeta={};
    rows.forEach(function(r){
      var k=(r.agent_name||"").trim().toLowerCase();
      var shown=String(r.display_name||"").trim().toLowerCase();
      // Legacy cleanup versions sometimes used __Hidden__ as a display-name sentinel.
      // Treat those rows as excluded everywhere until the one-click cleanup below retires them permanently.
      if((r.relationship_status==="inactive"||shown==="__hidden__"||k==="__hidden__")&&r.agent_name)ctInactiveRosterNames.add(k);
      if(r.lp_outreach_status==="nurture"&&r.relationship_status!=="inactive"&&shown!=="__hidden__"&&r.agent_name){ctNurtureRosterNames.add(k);ctNurtureRosterMeta[k]={reason:r.nurture_reason||"",next:r.next_rm_followup||""};}
    });
    assignments.forEach(function(r){
      if(r.lp==="__REMOVED__"&&r.agent_name)ctInactiveRosterNames.add((r.agent_name||"").trim().toLowerCase());
    });
    ctDisplayNames={};
    rows.forEach(function(r){if(r.agent_name&&r.display_name)ctDisplayNames[(r.agent_name||"").trim().toLowerCase()]=r.display_name.trim();});
  }catch(e){ctInactiveRosterNames=new Set();ctNurtureRosterNames=new Set();ctNurtureRosterMeta={};}
}
var userTyping=false;
var referralLeadsCache=null;

var SEED=[["ALEXIS AKERS","C",null,"2026-05-12","2026-03-25",null,null,false,1],["ALEXIS REED","C","Said","2026-07-06","2026-07-07","2026-01-30","2026-02-27",false,1],["ALI SWEAZY","C","Unassigned","2026-05-09","2026-05-09",null,null,false,1],["AMANDA HOWARD","C","Unassigned","2026-07-01","2026-07-01","2025-11-25","2025-12-23",false,1],["AMY AGRESTA","C","Gavin","2026-06-16","2026-06-16","2025-07-08","2025-08-05",false,1],["ANGELA PEREZ","C","Gavin","2026-04-27","2026-05-06","2026-04-06","2026-04-24",false,1],["ANGELA POTTS","C","Osgood","2026-05-10","2026-05-10",null,null,false,1],["ANGIE BRONOWSKI","B",null,"2025-12-03","2025-12-02","2025-12-29","2026-07-23",false,1],["ANNIE MORENO","B","Karen","2026-06-17","2026-06-18","2026-07-13","2026-06-12",false,1],["ANTHONY AMOS","C",null,"2026-06-03","2026-06-04","2024-08-28",null,false,1],["ASHLEY HENRY","C","Osgood","2026-04-22","2026-04-21",null,null,false,1],["AVA LAIRD","C","Jordan","2026-07-09","2026-07-09",null,null,false,1],["BAILEY STRATHIE","C","Osgood","2026-05-30","2026-05-30","2024-11-21",null,false,1],["BENJAMIN GAYTAN","C","Gavin","2026-05-16","2026-05-22",null,null,false,1],["BRAD GILLIAM","C","Gavin","2026-05-14",null,null,null,false,1],["BRANDON KIDD","C","Said","2026-05-01",null,null,null,false,1],["BRANDON MCCLENDON","C","Said","2026-06-08","2026-06-08",null,null,false,1],["BRANDON THOMPSON","A","Osgood","2026-07-12","2026-07-12","2026-05-04","2026-06-01",false,1],["BRIAN ZINN","C","Jordan","2026-07-14","2026-07-09",null,null,false,1],["CAROLE MCMAHON","C","Osgood","2026-05-31","2026-05-31","2026-05-08","2026-05-26",false,1],["CARRIE SISTARE-KOLIN CAUSEY","C","Unassigned",null,"2026-03-12","2026-04-03","2026-05-20",false,1],["CELINE WILLIAMS","C","Jordan","2026-06-01",null,null,null,false,1],["CHERYL KINSEY","C","Jordan","2026-05-05","2026-05-04",null,null,false,1],["CHRIS REED","A","Said","2026-07-01","2026-07-15","2026-07-08","2026-06-26",false,1],["CHRISTIAN CHALKIAS","C","Osgood","2026-07-08","2026-04-08",null,null,false,1],["CHRISTINA COUGHLIN","C","Osgood","2026-07-13","2026-07-13","2026-07-10",null,false,1],["CINDA ERICKSON","B","Gavin","2026-04-23","2026-04-21","2026-02-24","2026-03-26",false,1],["CLAUDIA CHUECA","C",null,null,"2026-07-02",null,null,false,1],["CLAUDIA CHUECO","C","Karen","2026-07-02",null,null,null,false,1],["CODA GAHRIS","C","Jordan","2026-04-29","2026-04-29","2026-05-25",null,false,1],["COLIN BURNHEIMER - THRIVE","C","Unassigned",null,"2026-06-30",null,null,false,1],["CONNER KOCHANSKY","A","Gavin","2026-07-10","2026-07-10","2026-06-22","2026-07-14",false,1],["CONNOR KOCHANSKY","C",null,"2025-07-18","2026-06-25",null,null,false,1],["COURTNEY HAMILTON","C","Osgood","2026-05-27","2026-05-27","2026-06-02","2026-06-17",false,1],["CRAIG MAURER","C","Osgood","2026-05-13","2026-05-19",null,null,false,1],["DAIRDRE SCRIVEN","C","Said","2026-05-19","2026-05-19",null,null,false,1],["DAN MANLEY","B","Gavin","2025-11-23","2026-04-29","2026-05-01","2026-05-19",false,1],["DARREN HOGG","C","Said","2026-04-22","2026-04-28",null,null,false,1],["DEANNE RHYNEHARDT","B","Osgood","2026-07-14","2026-07-14","2026-05-05","2026-06-12",false,1],["DERON BENDEN","C",null,null,"2026-06-15","2026-06-25",null,false,1],["DERON BENDER","A","Gavin","2025-08-11","2026-04-24","2026-04-28","2026-07-24",false,1],["DONALD PAYNE","C",null,null,"2026-06-07","2021-08-11",null,false,1],["DONALD PAYNE JR","C","Osgood","2026-06-04",null,null,null,false,1],["DUSTIN GOLDMAN","A","Osgood","2026-06-22","2026-04-24","2026-03-30","2026-03-27",false,1],["ELIAS PAPPAN","C","Karen","2026-04-30",null,null,null,false,1],["ELIZABETH ELLINGER","B","Jordan","2026-03-16","2026-04-01","2026-06-18","2026-07-20",false,1],["ELIZABETH HOWARD","C","Osgood","2026-07-05","2026-07-05","2024-11-08",null,false,1],["ERIKA (ROCKFORD)","C",null,null,"2026-06-17","2026-06-23",null,false,1],["ERIKA WEHNER","B","Gavin",null,"2026-04-13","2026-05-28","2026-05-11",false,1],["GAMAL HARDING","C","Unassigned","2026-06-17","2026-06-23","2025-10-17",null,false,1],["GEORGENA STARR","C",null,"2024-04-19","2026-07-09","2023-10-28",null,false,1],["GEORGENA XAMMAR","C","Unassigned","2026-07-09","2026-07-09","2023-03-07",null,false,1],["GLADIS CHAVEZ","C","Karen","2026-05-15","2026-05-05",null,null,false,1],["HAIFA BRUNNEY","B","Karen","2026-07-06","2026-07-03","2026-06-15","2026-07-14",false,1],["HEATHER EMMERT","C","Jordan","2026-06-11","2026-06-11","2024-09-06",null,false,1],["HEATHER HENRY-MINOR","B","Jordan","2026-04-07","2026-04-15","2026-05-05","2026-05-28",false,1],["HOLLY BLANKEN","C","Unassigned",null,"2026-05-14",null,null,false,1],["HYPATIA ESPINAL","C","Karen","2026-06-02","2026-06-02",null,null,false,1],["INGRID CORREA","C",null,null,"2026-07-15","2024-10-18",null,false,1],["INGRID CORREIA","B","Gavin","2026-07-15","2026-05-08","2025-12-11","2026-01-05",false,1],["IZXEL MARTINEZ","C","Karen","2026-05-20","2026-05-20","2026-06-02","2026-07-17",false,1],["JACOB ENGLISH","C","Jordan",null,"2026-03-18","2026-04-23","2026-06-12",false,1],["JAIDEN BALLAH","C","Said","2026-06-02","2026-06-03",null,null,false,1],["JASMIN MONTOYA","C","Karen","2026-06-25","2026-06-19",null,null,false,1],["JASMINE MCKENZIE","C","Osgood","2026-06-30","2026-05-04","2026-05-06","2026-05-29",false,1],["JEFF MESSMER","C","Gavin","2026-07-14","2026-05-12","2025-10-01",null,false,1],["JENNIFER BLACKMORE","C","Jordan","2026-05-02",null,null,null,false,1],["JESSE MCCRERRY","C","Said",null,"2026-04-06","2026-04-13","2026-05-26",false,1],["JESSICA TOWER","C","Jordan","2026-05-27","2026-05-30","2023-04-03",null,false,1],["JIMMY LIEU","C","Unassigned","2026-04-26",null,null,null,false,1],["JOHN BRUNNER","A","Jordan","2026-06-01","2026-06-01","2026-06-30","2026-07-17",false,1],["JOHN LUBINSKY","C","Said","2026-06-17","2026-06-17","2026-06-23","2026-03-20",false,1],["JONNATHAN AGUDELO","C","Karen","2026-06-23","2026-05-19",null,null,false,1],["JORDAN HOLLIBAUGH","C","Gavin",null,"2026-06-28","2026-07-15","2026-04-16",false,1],["JUANE MADARIS","C","Unassigned","2026-06-27",null,null,null,false,1],["JUSTIN BIERY","C","Karen","2026-05-27","2026-05-28",null,null,false,1],["KANDIS HALL","B","Osgood","2026-01-04","2026-07-14","2026-02-25","2026-03-17",false,1],["KATHERIE DE LA ROSA","C",null,null,"2026-06-29",null,null,false,1],["KATHERINE DE LA ROSA","B","Karen","2026-06-29","2026-06-23","2026-06-10","2026-07-15",false,1],["KATHY HAYES","C","Jordan","2026-07-08","2026-07-08","2024-12-09",null,false,1],["KATIE MANSOR","C","Jordan","2026-04-27","2026-04-26",null,null,false,1],["KATIE SUMMERS","B","Gavin",null,"2026-06-23","2026-02-26","2026-05-29",false,1],["KELSY YODER","C","Said","2026-04-28","2026-01-09","2026-01-12","2026-02-05",false,1],["KEVIN SPEERT","A","Gavin","2026-07-11","2026-06-24","2026-06-01","2026-06-26",false,1],["KHADIJA FARAH","B","Jordan","2026-07-09","2026-07-16","2026-02-09","2026-03-06",false,1],["KINSIE HUSKINS","C","Jordan",null,"2026-03-17","2026-04-28","2026-06-01",false,1],["KISHMA JAMES","C","Said","2026-07-10","2026-07-10","2025-06-09",null,false,1],["KRISTINA MURPHY","C","Osgood","2026-06-02","2026-05-11","2025-10-03","2025-10-21",false,1],["KUNLAVEE","C",null,null,"2026-06-03",null,null,false,1],["LAUREN MCCLINTON","C","Said",null,"2026-04-29",null,null,false,1],["LAUREN MICHELLE","C","Unassigned","2026-04-29",null,null,null,false,1],["LESLIE HERNANDEZ","C","Karen","2026-06-19","2026-06-29","2026-07-15","2026-06-18",false,1],["LETIKA WHITE","C","Osgood","2026-05-11","2026-06-15","2025-07-31","2025-08-29",false,1],["LEXIS GRANDY","C","Osgood","2026-06-11","2025-09-26","2025-09-29","2025-10-29",false,1],["LEZLEY MCCURRY","C","Unassigned",null,"2026-05-01",null,null,false,1],["LILIAN FUENTES","C","Karen","2026-04-21","2026-04-21",null,null,false,1],["LISA SIMMONS","C","Osgood",null,"2026-03-19","2026-04-14","2026-05-27",false,1],["LIZBEL CONTRERAS","C","Karen","2026-07-06","2026-06-12","2024-09-18",null,false,1],["LUIS GIL","C","Karen","2026-07-15","2026-06-30","2026-06-12","2025-09-26",false,1],["MAKAYLA & CONNER KOCHANSKY","C",null,null,"2025-11-06","2026-06-22","2026-07-14",false,1],["MARIA COMAS","C","Karen","2026-04-27","2026-03-02","2025-06-19","2025-07-21",false,1],["MARK VENNITTI","C","Jordan","2026-04-08","2026-04-08","2026-06-01","2026-06-18",false,1],["MARTIN HOPKINS","B","Karen","2026-02-12","2026-07-01","2026-01-29","2026-02-20",false,1],["MARY MCMICHAEL","B","Said","2026-04-13","2026-04-13","2026-06-14","2026-07-09",false,1],["MATHEA ARUDDA","C","Karen",null,"2026-03-16","2026-03-23","2026-07-17",false,1],["MATT BRADDY","C","Unassigned","2026-06-19",null,null,null,false,1],["MATT PIPER","A","Osgood","2026-05-19","2026-07-08","2026-07-09","2025-12-01",false,1],["MATTHEW MONTALVO","A","Karen","2026-04-09","2026-04-08","2026-05-29","2026-06-29",false,1],["MEGAN LYNCH","A","Gavin","2026-07-15","2026-07-14","2026-06-11","2026-07-13",false,1],["MICHELE FREDERICK","C","Osgood",null,"2026-05-31","2026-07-02",null,false,1],["MICHELLE HOLTZ","C","Unassigned",null,"2026-06-29",null,null,false,1],["MIKE WHITEMAN","C","Osgood",null,"2025-07-24","2025-07-31","2026-05-11",false,1],["MORGAN STONE","C","Unassigned","2026-06-29","2026-06-29",null,null,false,1],["NANCY BAKER","C","Unassigned","2026-04-30",null,null,null,false,1],["NANCY PRICE","B","Jordan","2026-01-03","2026-01-02","2026-05-08","2026-06-26",false,1],["NATALIE ESTRELLA","C","Karen","2026-06-14","2026-05-25","2026-07-01","2026-08-04",false,1],["NATHAN WHITE","C","Karen","2026-06-12","2026-06-16",null,null,false,1],["NIA HARRINGTON","C","Said","2026-05-13","2026-05-05","2024-10-17",null,false,1],["NICK ZATEZALO","C","Osgood","2026-07-09","2026-07-09","2024-03-12",null,false,1],["NINA AVERY","C","Jordan",null,"2026-04-23",null,null,false,1],["NORA KERELIUK","C","Said","2026-04-24",null,null,null,false,1],["OSCAR MARTINEZ","A","Karen","2026-07-13","2026-07-14","2026-05-05","2026-06-15",false,1],["PAIGE LUDWIG","C","Said","2026-06-08","2026-03-05","2026-03-17","2026-04-14",false,1],["PATRICK ARQUETTE","C","Said","2026-04-22","2026-01-14","2025-09-09","2025-10-07",false,1],["PAULA PALLESCHI","C","Said",null,"2026-04-21","2026-04-27","2026-05-26",false,1],["PILAR BENNETT","C","Karen","2026-07-10","2026-07-10","2025-07-23","2025-08-15",false,1],["RACHELLE PARSLEY","C","Said","2024-09-03","2026-04-15","2026-04-22","2026-05-13",false,1],["RACQUEL LUDAWAY","A","Gavin","2026-05-29","2026-05-19","2026-06-17","2026-07-10",false,1],["RAMI TAMIMI","B","Said","2026-11-04","2026-08-15","2026-08-27","2026-10-30",false,1],["RAMIRO SOLIS","C","Unassigned",null,"2026-07-01",null,null,false,1],["ROBERT HAYNER","C","Jordan",null,"2026-04-20","2026-04-23","2026-05-15",false,1],["ROCKFORD","C",null,null,"2026-06-22","2026-06-24",null,false,1],["ROSALIA PABLO","C","Karen","2026-07-14","2026-07-12","2024-11-08",null,false,1],["ROSS DIGIORGIO","C","Osgood","2026-06-25","2026-06-25","2025-07-14","2026-04-30",false,1],["RUTH GONZALEZ","C","Karen","2026-05-19","2026-05-19",null,null,false,1],["SAHAR SHALASH","A","Said","2026-07-09","2026-07-06","2026-05-09","2026-05-29",false,1],["SAHEL ALAM","C","Said","2026-05-10","2026-05-08","2026-07-10",null,false,1],["SAM BAMRICK","C","Jordan",null,"2026-04-14","2026-04-20","2026-05-15",false,1],["SARA BUSH","C","Said",null,"2026-03-27","2026-04-13","2026-05-27",false,1],["SARAH HERNANDEZ","C","Osgood","2026-05-28","2026-05-29","2024-10-21",null,false,1],["SETH COLBURN","B","Said","2025-04-23","2026-03-31","2026-04-06","2026-04-30",false,1],["SHARON PANTELIS","C","Jordan","2026-04-28","2025-03-21","2025-04-01",null,false,1],["SHAYNE D. BOYD","C","Said","2026-05-04","2026-05-07",null,null,false,1],["SHIRRELL BURNSIDE","C","Osgood","2026-06-26","2026-06-26",null,null,false,1],["SLAVI JORDANOV","C","Unassigned","2026-05-30","2025-10-06","2025-10-10","2025-11-07",false,1],["SLAVISHA JORDANOV","C",null,null,"2026-06-02",null,null,false,1],["STEVEN OSBORN","C","Jordan","2026-04-30","2026-02-03",null,null,false,1],["SUNI RIVAS","C","Karen","2026-06-12","2026-07-06",null,null,false,1],["TATIANA GRIGORITA","C","Jordan","2026-06-08","2026-06-08",null,null,false,1],["TIARA VILLATORO","A","Karen","2026-07-15","2026-07-15","2026-06-04","2026-06-26",false,1],["TIMOTHY OLIVER","C","Osgood","2026-06-09","2026-06-02",null,null,false,1],["TINA ALLEN","C","Unassigned",null,"2026-04-29",null,null,false,1],["TINA HOFFMAN","A","Gavin","2023-10-10","2026-05-06","2026-05-27","2026-02-10",false,1],["TINA HOFFMAN (ROCKFORD)","C",null,null,"2026-06-03","2026-06-05",null,false,1],["TINA-DUTT-HIREN","C","Osgood",null,"2026-05-11",null,null,false,1],["TODD STONE","A","Said","2026-07-14","2026-07-15","2026-06-25","2026-07-22",false,1],["TOM NEWMAN","C","Gavin","2026-06-08","2026-06-08","2024-01-08",null,false,1],["TONY AMOS","C","Unassigned","2026-07-15","2026-04-01","2024-02-27",null,false,1],["TRACI WILLIAMS-JONES","C","Jordan",null,"2026-04-09","2026-03-23","2026-05-21",false,1],["TRACY BERARD","B","Jordan",null,"2026-04-04","2026-04-14","2026-05-27",false,1],["TROY BORDEN","C","Gavin","2026-04-28","2026-04-30","2026-04-22","2026-05-13",false,1],["YASMIN DE JESUS","C","Karen","2024-03-27","2025-11-18","2026-04-01","2026-04-29",false,1],["YVETTA HARRISON","C","Osgood","2026-06-04",null,null,null,false,1],["ZILLOW","C",null,null,"2026-04-25",null,null,false,1]];

// ── LP sub-tab switching ──

function switchLeadsTab(tab, btn){
  document.querySelectorAll("#view-leads .d-tab").forEach(function(t){t.classList.remove("active");});
  document.querySelectorAll("#view-leads .d-tab-panel").forEach(function(p){p.classList.remove("active");});
  if(btn) btn.classList.add("active");
  var panel = document.getElementById("leads-tab-"+tab);
  if(panel) panel.classList.add("active");
  if(tab==="leads") loadReferralLeadsDirect();
  if(tab==="roster"){
    renderGrowthScoreboard();renderVelocifyLeaderboard();renderLeaderboard();renderChurnRisk();renderLpEffectiveness();
    var csEl=document.getElementById("conv-range-start"),ceEl=document.getElementById("conv-range-end");
    if(csEl&&!csEl.value){csEl.value="2026-04-01";ceEl.value=localDateStr(new Date());runConversionRangeSearch();}
  }
  if(tab==="growth"){renderGrowthScoreboard();renderDaniel();renderTierMovementPanel();}
}

function openLeadsView(btn){
  rmStopPolling(); lpStopPolling();
  currentUser="Leads";
  document.querySelectorAll(".who-btn").forEach(function(b){b.classList.remove("active");});
  if(btn) btn.classList.add("active");
  document.querySelectorAll(".view").forEach(function(v){v.classList.remove("active");});
  document.getElementById("view-leads").classList.add("active");
  loadReferralLeadsDirect();
}


function loadReferralLeadsDirect(){
  var lu2=document.getElementById("ref-last-updated-v2");
  if(lu2)lu2.textContent="Loading...";
  var mtdStart=TODAY.getFullYear()+"-"+String(TODAY.getMonth()+1).padStart(2,"0")+"-01";
  sbFetch("GET","velocify_leads?date_added=gte."+mtdStart+"&select=*&order=date_added.desc&limit=5000").then(function(res){
    // Management top-line = every lead returned by the Core Team Velocify mirror.
    // Do not silently discard leads assigned to another Core Team user (ex: Isaak).
    referralLeadsCache=(res||[]);
    renderReferralLeadsDirect(referralLeadsCache);
    if(lu2)lu2.textContent="Tracker refreshed "+new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
  }).catch(function(){
    if(lu2)lu2.textContent="Could not load — check connection";
    renderReferralLeadsDirect([]);
  });
}

function sortArrow(col){
  if(refSort.col!==col)return'<span style="color:#cbd5e1;font-size:9px"> ⇅</span>';
  return refSort.dir===1?'<span style="color:var(--accent);font-size:9px"> ▲</span>':'<span style="color:var(--accent);font-size:9px"> ▼</span>';
}


// v55 — ONE source of truth for Lead → App conversion.
// Lead -> App means an Encompass file/application is confirmed. "Started" is the conversion point.
// Later Encompass loan milestones also prove an app exists. Does Not Qualify alone is intentionally
// excluded because it is not reliable proof that the Loans I Started milestone occurred.
function ctIsLeadAppConverted(value){
  var row=(value&&typeof value==="object")?value:null;
  if(row){
    // Future-proofing: if Zapier/Supabase later stores a permanent conversion marker,
    // honor it without requiring another tracker rewrite.
    if(row.converted_to_app===true||row.converted_to_app==="true"||row.app_started_at||row.file_started_at||row.started_at)return true;
  }
  var s=((row?row.status:value)||"").toString().toLowerCase().trim();
  if(!s)return false;

  var convertedSignals=[
    "started","file started",
    "application withdrawn","application denied",
    "approval","approved","preapproval","pre-approval",
    "ready for pack out","rfpo",
    "submittal","submitted","submission",
    "processing","underwriting","underwriter",
    "conditional approval","conditions",
    "clear to close","ctc",
    "closing","funding","funded",
    "loan closed","closed"
  ];
  return convertedSignals.some(function(k){return s.indexOf(k)>=0;});
}

// Resolved statuses should not be sent back into "Needs Touch" just because they
// are not an app conversion (for example, Not Interested, Bad Lead, or DNC).
// Velocify Contacted means an appointment is scheduled. These statuses end initial outreach.
function ctInitialOutreachComplete(value){
  var s=String((value && typeof value==="object" ? value.status : value)||"").trim().toLowerCase().replace(/\s+/g," ");
  return s==="contacted" || /^(?:does|do) not qualify\b/.test(s);
}
function ctIsLeadResolved(value){
  var s=((value&&typeof value==="object"?value.status:value)||"").toString().toLowerCase().trim();
  if(ctIsLeadAppConverted(value))return true;
  return /\b(?:does|do) not qualify\b/.test(s)||
         s.indexOf("not interested")>=0||
         s.indexOf("bad lead")>=0||
         s.indexOf("fake data")>=0||
         s.indexOf("do not contact")>=0||
         s.indexOf("duplicate")>=0;
}

// v57 source audit: explains exactly which current Supabase/Velocify statuses are driving
// the Lead -> App number. This does not change counts; it makes stale/missing Zap updates visible.
function ctLeadStatusBucket(value){
  if(ctIsLeadAppConverted(value))return "converted";
  if(ctIsLeadResolved(value))return "resolved-nonapp";
  var s=((value&&typeof value==="object"?value.status:value)||"").toString().toLowerCase().trim();
  if(!s||s==="new"||s.indexOf("contact attempt")>=0||s==="contacted"||s.indexOf("nurture")>=0||s.indexOf("scheduled")>=0)return "pre-app";
  return "unmapped";
}
function ctRenderLeadStatusAudit(data){
  var host=document.getElementById("ref-status-audit-v2");
  if(!host)return;
  var map={};
  (data||[]).forEach(function(r){
    var label=(r.status||"(blank)").toString().trim()||"(blank)";
    if(!map[label])map[label]={status:label,count:0,bucket:ctLeadStatusBucket(r)};
    map[label].count++;
  });
  var rows=Object.keys(map).map(function(k){return map[k];}).sort(function(a,b){return b.count-a.count||a.status.localeCompare(b.status);});
  var sums={converted:0,"resolved-nonapp":0,"pre-app":0,unmapped:0};
  rows.forEach(function(r){sums[r.bucket]=(sums[r.bucket]||0)+r.count;});
  function lab(b){return b==="converted"?"Counts as app":b==="resolved-nonapp"?"Resolved, no app":b==="pre-app"?"Pre-app / open":"Unmapped — review";}
  function bg(b){return b==="converted"?"#EAF5EE":b==="resolved-nonapp"?"#F4F6F9":b==="pre-app"?"#EFF6FF":"#FFF4E5";}
  function fg(b){return b==="converted"?"#276749":b==="resolved-nonapp"?"#596579":b==="pre-app"?"#1D4ED8":"#9A5B13";}
  var h='<div style="padding:8px 9px;background:#F8FBFC;border-radius:7px;margin-bottom:8px;line-height:1.5"><b>This is the latest synced database view:</b> '+(data||[]).length+' MTD lead rows · <b>'+sums.converted+'</b> currently prove an application · '+sums["pre-app"]+' are still showing pre-app/open statuses · '+sums["resolved-nonapp"]+' are resolved without an app'+(sums.unmapped?' · <b style="color:#9A5B13">'+sums.unmapped+' unmapped</b>':'')+'.<br><span style="color:#667085">Velocify syncs once daily, so this is not real-time. If someone was Started in Velocify later today but still appears below as New, Contacted, Contact Attempt, or Nurture, the tracker will not see that change until the next daily sync.</span></div>';
  h+='<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th style="text-align:left;padding:6px 8px">Current status in database</th><th style="text-align:center;padding:6px 8px">Leads</th><th style="text-align:left;padding:6px 8px">Lead → App treatment</th></tr></thead><tbody>';
  rows.forEach(function(r){h+='<tr><td style="padding:6px 8px">'+escHtml(r.status)+'</td><td style="padding:6px 8px;text-align:center;font-weight:700">'+r.count+'</td><td style="padding:6px 8px"><span style="display:inline-block;padding:2px 7px;border-radius:20px;background:'+bg(r.bucket)+';color:'+fg(r.bucket)+';font-weight:700">'+lab(r.bucket)+'</span></td></tr>';});
  h+='</tbody></table></div>';
  host.innerHTML=h;
}

// Reporting-only deduplication: preserve every raw Velocify record for audit and
// LP handoff history, but count each logical borrower referral once.
function ctUniqueVelocifyReferralRows(rows){
  var chosen=new Map(),unkeyed=[];
  (rows||[]).forEach(function(r){
    var key=String(r.lead_key||"").trim().toLowerCase();
    if(!key){unkeyed.push(r);return;}
    var old=chosen.get(key);
    if(!old){chosen.set(key,r);return;}
    // Keep the strongest timestamp when the source supplies one. Do not treat
    // a "Bad Lead" row as more authoritative than "Started" without dated evidence.
    function freshness(x){return Date.parse(x.last_update||x.last_action_date||x.created_at||"")||0;}
    function rank(x){return ctIsLeadAppConverted(x)?2:ctIsLeadResolved(x)?1:0;}
    var oldFresh=freshness(old),newFresh=freshness(r),pickNew=newFresh>oldFresh||(newFresh===oldFresh&&rank(r)>rank(old));
    var winner=pickNew?r:old,loser=pickNew?old:r;
    var owners=[old.lp_user,r.lp_user].map(function(v){return String(v||"").trim().toLowerCase();}).filter(Boolean);
    if(owners.length===2&&owners[0]!==owners[1]){
      winner=Object.assign({},winner,{lp_user:"Ownership conflict — review",_conflicting_lp_owners:[old.lp_user,r.lp_user]});
    }
    if(pickNew||winner!==old)chosen.set(key,winner);
  });
  return Array.from(chosen.values()).concat(unkeyed);
}
function renderReferralLeadsDirect(data){
  data=ctUniqueVelocifyReferralRows(data);
  // Compute stats
  var now=new Date();
  var todayStr=localDateStr(now);
  var prior=new Date(now);prior.setDate(prior.getDate()-1);
  var priorStr=localDateStr(prior);
  // Use refFilters (the main filter state object)
  var activeFilters={status:refFilters.status?[refFilters.status]:[],lp:refFilters.lp?[refFilters.lp]:[]};

  function lpMatch(r){
    var lpMap={"Gavin":["Dill","Gavin"],"Karen":["De La Riva","Karen"],"Osgood":["McMahon","Osgood"],"Jordan":["Johnston","Jordan"],"Said":["Saleh","Said"],"Isaak":["Caldwell","Isaak"]};
    if(!activeFilters.lp||!activeFilters.lp.length)return true;
    return activeFilters.lp.some(function(lp){
      return lpMap[lp]&&lpMap[lp].some(function(k){return(r.lp_user||"").indexOf(k)>=0;});
    });
  }
  function statusMatch(r){
    if(!activeFilters.status||!activeFilters.status.length)return true;
    var st=(r.status||"").toLowerCase();
    return activeFilters.status.some(function(s){
      if(s==="Converted to App")return ctIsLeadAppConverted(r);
      if(s==="Contact Attempt")return st.indexOf("contact attempt")>=0||st.indexOf("contact_attempt")>=0;
      if(s==="Contacted")return st==="contacted";
      if(s==="Nurture")return st.indexOf("nurture")>=0;
      if(s==="App Withdrawn")return st.indexOf("withdrawn")>=0||st.indexOf("app withdrawn")>=0;
      if(s==="Scheduled")return st.indexOf("scheduled")>=0;
      if(s==="Other")return !ctIsLeadAppConverted(r)&&(st===""||st==="new"||["contacted","contact attempt","nurture","withdrawn","scheduled"].every(function(k){return st.indexOf(k)<0;}));
      return true;
    });
  }

  // KPI math is based on the full MTD population (or the selected LP), NOT the selected status chip.
  // This prevents a status filter such as Contact Attempt from changing the Lead → App KPI itself.
  var metricBase=data.filter(function(r){return lpMatch(r);});
  var mtd=metricBase.length;
  var appConversions=metricBase.filter(function(r){return ctIsLeadAppConverted(r);}).length;
  var ltf=mtd>0?Math.round(appConversions/mtd*100):0;

  // Operational sections stay useful while a status chip is selected. Nurture remains excluded
  // from the default work queues, but is still available in the all-MTD filtered-results panel.
  var operational=metricBase.filter(function(r){
    return (r.status||"").toLowerCase().indexOf("nurture")<0;
  });
  var todayLeads=operational.filter(function(r){return r.date_added===todayStr;});
  var priorLeads=operational.filter(function(r){return r.date_added===priorStr;});
  var unconverted=operational.filter(function(r){return!ctIsLeadAppConverted(r);});
  var needsTouch=operational.filter(function(r){
    var st=(r.status||"").toLowerCase();
    // Exclude converted/resolved and scheduled leads — those are already handled
    if(ctInitialOutreachComplete(r)||ctIsLeadResolved(r)||st.indexOf("scheduled")>=0)return false;
    var actionDate=r.last_action_date||r.last_update;
    if(!actionDate)return true;
    var lastUp=new Date(actionDate+"T12:00:00");
    return(now-lastUp)>86400000;
  });

  // Filter chips and KPI cards are drill-down views, not KPI recalculations.
  var filterResults=metricBase.filter(function(r){return statusMatch(r);});
  if(refMetricDrilldown==="all")filterResults=metricBase.slice();
  if(refMetricDrilldown==="converted"||refMetricDrilldown==="rate")filterResults=metricBase.filter(function(r){return ctIsLeadAppConverted(r);});
  if(refMetricDrilldown==="needs")filterResults=needsTouch.slice();
  var hasActiveFilter=!!(refFilters.status||refFilters.lp||refMetricDrilldown);

  ctRenderLeadStatusAudit(data);

  // Update stat cards
  var el=function(id){return document.getElementById(id);};
  if(el("ref-mtd-leads-v2"))el("ref-mtd-leads-v2").textContent=mtd;
  if(el("ref-file-starts-v2"))el("ref-file-starts-v2").textContent=appConversions;
  if(el("ref-ltf-v2"))el("ref-ltf-v2").textContent=ltf+"%";
  if(el("ref-ltf-formula-v2"))el("ref-ltf-formula-v2").textContent=appConversions+" apps ÷ "+mtd+" leads";
  if(el("ref-needs-touch-v2"))el("ref-needs-touch-v2").textContent=needsTouch.length;

  // Today label
  var todayLabel=now.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
  var priorLabel=prior.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
  if(el("ref-today-label-v2"))el("ref-today-label-v2").textContent=todayLabel;
  if(el("ref-prior-label-v2"))el("ref-prior-label-v2").textContent=priorLabel;

  // Needs touch
  var ntSect=el("ref-needs-touch-section-v2");
  if(ntSect)ntSect.style.display=needsTouch.length?"block":"none";
  if(el("ref-needs-touch-count-v2"))el("ref-needs-touch-count-v2").textContent=needsTouch.length+" lead"+(needsTouch.length!==1?"s":"");

  // Render table helper
  function renderTable(leads,containerId,countId){
    var c=el(containerId),cnt=el(countId);
    if(cnt)cnt.textContent=leads.length+" lead"+(leads.length!==1?"s":"");
    if(!c)return;
    if(!leads.length){c.innerHTML='<div style="padding:12px 16px;font-size:12px;color:var(--text-3)">No leads</div>';return;}
    var h="";
    leads.forEach(function(r,ri){
      var agent=escHtml(r.referral_partner_name||"Unknown");
      var buyer=r.buyer_name?escHtml(r.buyer_name):"—";
      var date=r.date_added?new Date(r.date_added+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}):"—";
      var status=r.status||"—";
      var lpDisp=r.lp_user?r.lp_user.split(",").reverse().join(" ").trim():"—";
      var note=r.last_action_note&&r.last_action_note.toLowerCase()!=="empty"?r.last_action_note:"";
      var rowId=containerId+"-"+ri;
      var agentAttr=escHtml(r.referral_partner_name||"").replace(/"/g,"&quot;");
      var buyerAttr=escHtml(r.buyer_name||"").replace(/"/g,"&quot;");
      var lpAttr=escHtml(lpDisp).replace(/"/g,"&quot;");
      h+='<div style="border-bottom:1px solid var(--border-light)">';
      h+='<div style="padding:10px 16px;display:flex;gap:10px;align-items:flex-start;cursor:pointer" onclick="ctToggleLeadDrawer(\''+rowId+'\')">';
      h+='<div style="flex:1;min-width:0">';
      h+='<div style="font-size:12px;font-weight:700;color:var(--text)">'+agent+'</div>';
      h+='<div style="font-size:11px;color:var(--text-2)">Buyer: '+buyer+' · '+lpDisp+'</div>';
      if(note)h+='<div style="font-size:11px;color:var(--text-3);font-style:italic;margin-top:2px">"'+escHtml(note.substring(0,80))+'"</div>';
      h+='</div>';
      h+='<div style="text-align:right;flex-shrink:0">';
      h+='<div style="font-size:11px;font-weight:600;color:var(--text)">'+date+'</div>';
      if(typeof ctIsLeadStalled==="function" && ctIsLeadStalled(r)) h+='<span style="font-size:9.5px;font-weight:700;padding:2px 7px;border-radius:20px;background:#FBEBE9;color:#B54B42;margin-right:4px">⚠ Stalled</span>';
      h+='<span style="font-size:10px;padding:2px 7px;border-radius:20px;background:#f1f5f9;color:#475569">'+status+'</span>';
      h+='</div></div>';
      h+=ctBuyerDrawerHtml(rowId,agentAttr,buyerAttr,lpAttr,typeof ctIsLeadStalled==="function"&&ctIsLeadStalled(r));
      h+='</div>';
    });
    c.innerHTML=h;
  }

  var filterSect=el("ref-filter-results-section-v2");
  if(filterSect){
    filterSect.style.display=hasActiveFilter?"block":"none";
    if(hasActiveFilter){
      var filterLabel=[];
      if(refMetricDrilldown==="all")filterLabel.push("All MTD leads");
      if(refMetricDrilldown==="converted")filterLabel.push("Converted to App");
      if(refMetricDrilldown==="rate")filterLabel.push("Lead → App audit: "+appConversions+" converted of "+mtd+" MTD = "+ltf+"%");
      if(refMetricDrilldown==="needs")filterLabel.push("Needs Touch");
      if(refFilters.lp)filterLabel.push(refFilters.lp);
      if(refFilters.status)filterLabel.push(refFilters.status);
      if(el("ref-filter-results-label-v2"))el("ref-filter-results-label-v2").textContent="— "+filterLabel.join(" · ");
      renderTable(filterResults,"ref-filter-results-table-v2","ref-filter-results-count-v2");
    }
  }

  renderTable(needsTouch,"ref-needs-touch-table-v2","ref-needs-touch-count-v2");
  renderTable(todayLeads,"ref-today-table-v2","ref-today-count-v2");
  renderTable(priorLeads,"ref-prior-table-v2","ref-prior-day-count-v2");
  renderTable(unconverted,"ref-uncovered-table-v2","ref-uncovered-count-v2");
}

function renderTierMovementPanel(){
  var el=document.getElementById("d-tier-movement-section");
  if(!el)return;
  // C→B and B→A each get two buckets: "ready now" (already qualifies, closes>=threshold) and
  // "one away" (exactly one close short). Daniel-approved thresholds: Channel=10+, A=4-9, B=2-3, C=1 close or 1 lead.
  var cToB_ready=[],cToB_close=[],bToA_ready=[],bToA_close=[];
  agents.forEach(function(a){
    if(!isActive(a))return;
    var closes=a[8]||0;
    var row={name:a[0],lp:a[2],closes:closes};
    if(a[1]==="C"){
      if(closes>=2)cToB_ready.push(row);
      else if(closes===1)cToB_close.push(row);
    }else if(a[1]==="B"){
      if(closes>=4)bToA_ready.push(row);
      else if(closes===3)bToA_close.push(row);
    }
  });
  [cToB_ready,cToB_close,bToA_ready,bToA_close].forEach(function(list){list.sort(function(a,b){return b.closes-a.closes;});});
  var total=cToB_ready.length+cToB_close.length+bToA_ready.length+bToA_close.length;
  if(!total){
    el.innerHTML='<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px;font-size:12px;color:var(--text-2)">No tier movement to show right now, based on current data. Upload the latest Power BI export to refresh.</div>';
    return;
  }
  var VISIBLE=6,uid=0;
  var row=function(c,badgeColor,badgeBg,badgeText){
    return'<div style="display:flex;align-items:center;gap:8px;padding:8px 16px;border-bottom:0.5px solid var(--border-light);flex-wrap:wrap">'
      +'<span style="font-size:12px;font-weight:600;color:var(--text);flex:1;min-width:100px">'+c.name+'</span>'
      +'<span class="lp-tag lp-tag-'+c.lp+'">'+c.lp+'</span>'
      +'<span style="font-size:11px;color:var(--text-2)">'+c.closes+' close'+(c.closes!==1?'s':'')+' (past year)</span>'
      +'<span style="background:'+badgeBg+';color:'+badgeColor+';font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px">'+badgeText+'</span>'
      +'</div>';
  };
  // Renders a subgroup with the first VISIBLE rows shown and the rest behind a "Show all" toggle.
  var subgroup=function(label,list,badgeColor,badgeBg,badgeText){
    if(!list.length)return"";
    uid++;
    var id="tm-group-"+uid;
    var visible=list.slice(0,VISIBLE),rest=list.slice(VISIBLE);
    var html='<div style="padding:6px 16px 2px;font-size:10.5px;font-weight:700;color:'+badgeColor+'">'+label+' ('+list.length+')</div>';
    visible.forEach(function(c){html+=row(c,badgeColor,badgeBg,badgeText);});
    if(rest.length){
      html+='<div id="'+id+'" style="display:none">';
      rest.forEach(function(c){html+=row(c,badgeColor,badgeBg,badgeText);});
      html+='</div>';
      html+='<div style="padding:6px 16px;text-align:center">'
        +'<button onclick="var d=document.getElementById(\''+id+'\');var open=d.style.display!==\'none\';d.style.display=open?\'none\':\'block\';this.textContent=open?\'Show all '+list.length+' \\u2192\':\'Show fewer\';" style="font-size:10.5px;font-weight:600;color:'+badgeColor+';background:none;border:1px solid '+badgeColor+';border-radius:20px;padding:3px 12px;cursor:pointer;font-family:inherit">Show all '+list.length+' &rarr;</button>'
        +'</div>';
    }
    return html;
  };
  var html='<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:1rem">'
    +'<div style="background:#1F4E79;padding:10px 16px;display:flex;justify-content:space-between;align-items:center">'
    +'<div style="font-size:12px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.04em">Tier movement ('+total+')</div>'
    +'<div style="font-size:10px;color:#93c5fd">Based on Power BI closing data</div>'
    +'</div>';
  // B → A shown first (green) since it's the higher-value transition, then C → B (blue).
  html+='<div style="border-bottom:2px solid #dcfce7;background:#f0fdf4;padding:8px 16px 2px;font-size:11px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:.04em">B &rarr; A</div>';
  html+=subgroup("A threshold reached (4+ closes)",bToA_ready,"#15803d","#dcfce7","Ready \u2192 A");
  html+=subgroup("1 close away (3 closes)",bToA_close,"#15803d","#dcfce7","\u2192 A soon");
  if(!bToA_ready.length&&!bToA_close.length)html+='<div style="padding:8px 16px;font-size:11px;color:var(--text-3)">No one in range right now.</div>';
  html+='<div style="border-bottom:2px solid #dbeafe;background:#eff6ff;padding:8px 16px 2px;font-size:11px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:.04em;margin-top:6px">C &rarr; B</div>';
  html+=subgroup("Ready now (2+ closes)",cToB_ready,"#1d4ed8","#dbeafe","Ready \u2192 B");
  html+=subgroup("1 close away (1 close)",cToB_close,"#1d4ed8","#dbeafe","\u2192 B soon");
  if(!cToB_ready.length&&!cToB_close.length)html+='<div style="padding:8px 16px;font-size:11px;color:var(--text-3)">No one in range right now.</div>';
  html+='</div>';
  el.innerHTML=html;
}

// ── REFERRAL LEADS LOGIC ──
// getStatusBadgeClass and loadReferralLeadsDirect are the live versions (see below)

// buildLeadsTable defined below (active version)

function effectiveDays(a){
  // Relationship cadence is TEAM-aware: a real RM connection counts just like a real LP connection.
  // Voicemail/text attempts still do not reset cadence.
  var logDate=null,histDate=null,actDate=null,rmDate=null;
  var log=callLogs[a[0]];
  if(log&&log.call_date&&lpHasLiveConnectionLog(log))logDate=new Date(log.call_date+'T12:00:00');
  var hist=agentLastCall[a[0]]||null;
  // agent_call_summary is legacy and can include attempts. If it equals this week’s known non-live
  // attempt date, ignore it so a VM/text cannot falsely make the relationship look freshly connected.
  if(hist&&!(log&&log.call_date===hist&&!lpHasLiveConnectionLog(log)))histDate=new Date(hist+'T12:00:00');
  var act=mostRecent(a);
  if(act)actDate=new Date(act+'T12:00:00');
  var rmd=rmLatestMeaningful[assignmentKey(a[0])]||null;
  if(rmd)rmDate=new Date(rmd+'T12:00:00');
  var candidates=[logDate,histDate,actDate,rmDate].filter(Boolean);
  if(!candidates.length)return null;
  var best=candidates.reduce(function(a,b){return a>b?a:b;});
  best.setHours(0,0,0,0);
  return Math.floor((TODAY-best)/86400000);
}

function tierWindow(a){
  var tier=a[1]||"C";
  if(tier==="A")return 7;
  if(tier==="B")return 14;
  return 21;
}

function daysOverdue(a){
  var days=effectiveDays(a);
  if(days===null)return 99999; // never called = most overdue
  return days - tierWindow(a); // positive = overdue, negative = not due yet
}

function getRotation(lp){
  var active=agents.filter(function(a){return a[2]===lp&&ctRosterEligible(a)&&isActive(a)&&!lpOpenRmFlags[assignmentKey(a[0])]&&(calledThisWeek(a[0])||!lpRmCoordinationHold(a));});
  if(!active.length)return[];
  var priority=active.filter(isPriority);
  var normal=active.filter(function(a){return!isPriority(a);});

  // Split into overdue and not yet due
  var overdue=normal.filter(function(a){return daysOverdue(a)>=0;});
  var notDue=normal.filter(function(a){return daysOverdue(a)<0;});

  // Sort overdue by most overdue first
  overdue.sort(function(a,b){return daysOverdue(b)-daysOverdue(a);});
  // Sort not-due by closest to being due next
  notDue.sort(function(a,b){return daysOverdue(b)-daysOverdue(a);});

  // CARRYOVER: pin last week’s missed agents to the top so they can't be skipped again
  var missedLastWeek=getLpMissedLastWeek(lp).filter(function(a){return isActive(a)&&(calledThisWeek(a[0])||!lpRmCoordinationHold(a));});

  // Priority first, then last week’s misses, then overdue, then fill with closest-to-due
  var combined=priority.concat(missedLastWeek).concat(overdue).concat(notDue);
  var seen={},res=[];
  for(var j=0;j<combined.length;j++){if(!seen[combined[j][0]]){seen[combined[j][0]]=true;res.push(combined[j]);}}
  return res;
}

function getLastWeekRotation(lp){
  var active=agents.filter(function(a){return a[2]===lp&&ctRosterEligible(a)&&isActive(a);});
  if(!active.length)return[];
  var priority=active.filter(isPriority);
  var normal=active.filter(function(a){return!isPriority(a);});
  // For scorecard purposes use alphabetical fallback for last week
  normal.sort(function(a,b){return a[0]<b[0]?-1:1;});
  var remaining=Math.max(0,15-priority.length);
  var base=normal.slice(0,remaining);
  var combined=priority.concat(base);
  var seen={},res=[];
  for(var j=0;j<combined.length;j++){if(!seen[combined[j][0]]){seen[combined[j][0]]=true;res.push(combined[j]);}}
  return res.slice(0,15);
}

function lpMissingAgentProfileColumn(err){
  var msg=String((err&&err.message)||"");
  var m=msg.match(/Could not find the [\'\"]([^\'\"]+)[\'\"] column of [\'\"]agent_profiles[\'\"]/i)
      ||msg.match(/column [\'\"]?([^\'\"\s]+)[\'\"]? does not exist/i);
  return m&&m[1]?m[1]:null;
}
function lpDropSelectColumn(path,col){
  try{
    var q=path.indexOf("?");if(q<0)return null;
    var base=path.slice(0,q),params=new URLSearchParams(path.slice(q+1));
    if(!params.has("select"))return null;
    var cols=params.get("select").split(",").map(function(x){return x.trim();}).filter(Boolean);
    if(cols.indexOf(col)<0)return null;
    cols=cols.filter(function(x){return x!==col;});if(!cols.length)return null;
    params.set("select",cols.join(","));return base+"?"+params.toString();
  }catch(e){return null;}
}
function lpDropBodyColumn(body,col){
  if(!body||col==="agent_name")return null;
  var changed=false;
  if(Array.isArray(body)){
    var rows=body.map(function(row){if(row&&typeof row==="object"&&Object.prototype.hasOwnProperty.call(row,col)){var c=Object.assign({},row);delete c[col];changed=true;return c;}return row;});
    return changed?rows:null;
  }
  if(typeof body==="object"&&Object.prototype.hasOwnProperty.call(body,col)){var copy=Object.assign({},body);delete copy[col];return copy;}
  return null;
}
// v45 connection stability: use one realistic timeout for Supabase traffic. A slow request is
// not the same thing as being offline, and any HTTP response proves the server was reached.
function sbFetch(method,path,body,_schemaRetry){
  var retry=Number(_schemaRetry||0);
  if(method==="GET"&&retry===0&&String(path||"").indexOf("velocify_leads?")===0){
    var query=String(path).split("?")[1]||"",params=new URLSearchParams(query),requested=Number(params.get("limit")||0);
    if(requested>1000){
      var resource=String(path).split("?")[0];params.delete("limit");params.delete("offset");var allRows=[];
      function readLeadPage(offset){
        var pageParams=new URLSearchParams(params),pageLimit=Math.min(1000,requested-offset);pageParams.set("limit",String(pageLimit));pageParams.set("offset",String(offset));
        return sbFetch("GET",resource+"?"+pageParams.toString(),undefined,1).then(function(rows){
          rows=Array.isArray(rows)?rows:[];allRows=allRows.concat(rows);
          return rows.length===pageLimit&&offset+rows.length<requested?readLeadPage(offset+rows.length):allRows;
        });
      }
      return readLeadPage(0);
    }
  }
  var controller=new AbortController();
  var timer=setTimeout(function(){controller.abort();},20000);
  var opts={method:method,signal:controller.signal,cache:"no-store",headers:{"apikey":SB_KEY,"Authorization":"Bearer "+SB_KEY,"Content-Type":"application/json","Prefer":method==="POST"?"resolution=merge-duplicates,return=minimal":"return=representation"}};
  if(body!==undefined&&body!==null)opts.body=JSON.stringify(body);
  return fetch(SB_URL+"/rest/v1/"+path,opts).then(function(r){
    lpMarkServerReachable();
    if(!r.ok)return r.text().then(function(t){
      var parsed=null;try{parsed=t?JSON.parse(t):null;}catch(e){}
      var msg=(parsed&&parsed.message)||t||("HTTP "+r.status);
      var err=new Error(msg);err.status=r.status;err.body=parsed;
      if(String(path||"").startsWith("agent_profiles")&&retry<10){
        var col=lpMissingAgentProfileColumn(err);
        if(col&&col!=="agent_name"){
          if(method==="GET"){
            var saferPath=lpDropSelectColumn(path,col);
            if(saferPath){console.warn("agent_profiles read skipped unsupported optional field '"+col+"'.");return sbFetch(method,saferPath,body,retry+1);}
          }else if(method==="POST"||method==="PATCH"){
            var saferBody=lpDropBodyColumn(body,col);
            if(saferBody){console.warn("agent_profiles write skipped unsupported optional field '"+col+"'.");return sbFetch(method,path,saferBody,retry+1);}
          }
        }
      }
      throw err;
    });
    return r.text().then(function(t){return t?JSON.parse(t):null;});
  }).catch(function(err){
    if(err&&err.name==="AbortError"){
      var timeoutErr=new Error("Supabase is responding slowly. Please retry if this does not recover.");
      timeoutErr.code="LP_TIMEOUT";
      throw timeoutErr;
    }
    if(err&&err.status===undefined&&(/Failed to fetch|NetworkError|Load failed/i).test(String(err.message||err))){err.code=err.code||"LP_NETWORK";}
    throw err;
  }).finally(function(){clearTimeout(timer);});
}

// v22: schema-safe writes to the shared agent_profiles table.
// If an optional UI field is not present in the live Supabase schema, remove only
// that unsupported field and retry instead of failing the entire contact update.
function lpProfileWrite(method,path,payload){
  var body=Object.assign({},payload||{});
  function attempt(remaining){
    return sbFetch(method,path,body).catch(function(err){
      var col=lpMissingAgentProfileColumn(err);
      if(!col || !(col in body) || col==="agent_name" || remaining<=0)throw err;
      delete body[col];
      console.warn("agent_profiles schema does not include optional field '"+col+"'; save retried without it.");
      return attempt(remaining-1);
    });
  }
  return attempt(10);
}

function loadCallLogs(){
  if(!window._lpBootInProgress)setSyncStatus("saving");
  return Promise.all([
    sbFetch("GET","call_logs?week_key=eq."+weekKey+"&select=*"),
    sbFetch("GET","call_logs?week_key=eq."+lastWeekKey+"&select=*"),
    sbFetch("GET","lp_flags?resolved=eq.false&select=id,agent_name,lp,note,created_at").catch(function(err){console.warn("LP flags load skipped:",err);return[];})
  ]).then(function(res){
    callLogs={};lastWeekLogs={};lpOpenRmFlags={};
    if(res[0])res[0].forEach(function(r){callLogs[r.agent_name]=r;});
    if(res[1])res[1].forEach(function(r){lastWeekLogs[r.agent_name]=r;});
    if(res[2])res[2].forEach(function(r){if(r.agent_name)lpOpenRmFlags[assignmentKey(r.agent_name)]=r;});
    setSyncStatus("live");
    lpScheduleBackgroundRefresh();
    return res;
  }).catch(function(err){
    console.error("LP call-log load failed:",err);
    lpHandleSyncError(err);
    return null;
  });
}

function upsertCallLog(name,lp,note){
  var id=name+"__"+weekKey;
  var existingOutcome=callLogs[name]?callLogs[name].outcome||"":"";
  var data={id:id,agent_name:name,lp:lp,week_key:weekKey,call_date:localDateStr(TODAY),note:note||"",outcome:existingOutcome};
  callLogs[name]=data;
  setSyncStatus("saving");
  return sbFetch("POST","call_logs",data).then(function(){
    return sbFetch("POST","call_logs_history",{agent_name:name,lp:lp,week_key:weekKey,call_date:localDateStr(TODAY),note:note||""});
  }).then(function(){
    // Phase 2: upsert activation milestone for first LP call
    var nameUpper=name.toUpperCase();
    if(!agentMilestones[nameUpper]||!agentMilestones[nameUpper].first_lp_call_date){
      sbFetch("POST","agent_milestones",{agent_name:name,first_lp_call_date:localDateStr(TODAY),first_lp_call_by:lp,activation_status:"contacted"}).catch(function(){});
      if(!agentMilestones[nameUpper])agentMilestones[nameUpper]={};
      agentMilestones[nameUpper].first_lp_call_date=localDateStr(TODAY);
      agentMilestones[nameUpper].first_lp_call_by=lp;
    }
    setSyncStatus("live");
  }).catch(function(e){lpHandleSyncError(e);console.error("Call log save failed for "+name+":",e);});
}

function deleteCallLog(name){
  var id=name+"__"+weekKey;
  delete callLogs[name];
  setSyncStatus("saving");
  return sbFetch("DELETE","call_logs?id=eq."+encodeURIComponent(id))
    .then(function(){setSyncStatus("live");}).catch(function(err){lpHandleSyncError(err);console.error("LP delete failed:",err);});
}

function setSyncStatus(s){
  var dot=document.getElementById("syncDot"),ind=document.getElementById("saveInd");
  if(!dot||!ind)return;
  if(s==="live"){dot.className="sync-dot live";ind.textContent="Live";}
  else if(s==="saving"){dot.className="sync-dot saving";ind.textContent="Syncing...";}
  else if(s==="loading"){dot.className="sync-dot saving";ind.textContent="Loading...";}
  else if(s==="slow"){dot.className="sync-dot slow";ind.textContent="Slow connection · Retry";}
  else if(s==="offline"){dot.className="sync-dot error";ind.textContent="Offline · Retry";}
  else{dot.className="sync-dot error";ind.textContent="Sync problem · Retry";}
}
var lpLastServerSuccessAt=0;
function lpMarkServerReachable(){
  lpLastServerSuccessAt=Date.now();
  var ind=document.getElementById("saveInd");
  if(!ind)return;
  var txt=String(ind.textContent||"");
  if(/Connecting|Loading|Slow connection|Offline|Sync problem/.test(txt))setSyncStatus("live");
}
function lpHandleSyncError(err){
  var msg=String((err&&err.message)||err||"");
  if(typeof navigator!=="undefined"&&navigator.onLine===false){setSyncStatus("offline");return "offline";}
  if((err&&err.code==="LP_TIMEOUT")||/responding slowly|timed out/i.test(msg)){setSyncStatus("slow");return "slow";}
  if((err&&err.code==="LP_NETWORK")||/Failed to fetch|NetworkError|Load failed/i.test(msg)){setSyncStatus("offline");return "offline";}
  setSyncStatus("error");return "error";
}
var lpLastBackgroundRefresh=0,lpBackgroundRefreshTimer=null;
function lpStaggerTasks(tasks,gap){
  (tasks||[]).forEach(function(task,i){setTimeout(function(){try{var p=task();if(p&&p.catch)p.catch(function(e){console.warn("LP background load skipped:",e);});}catch(e){console.warn("LP background load skipped:",e);}},i*(gap||180));});
}
function lpScheduleBackgroundRefresh(){
  if(window._lpBootInProgress)return;
  var now=Date.now();
  if(now-lpLastBackgroundRefresh<60000)return;
  lpLastBackgroundRefresh=now;
  clearTimeout(lpBackgroundRefreshTimer);
  lpBackgroundRefreshTimer=setTimeout(function(){
    lpStaggerTasks([loadPrevNotes,loadRmActivity,loadVelocifyLeads,loadCoMarketing,loadAgentMilestones,loadChurnRisk,loadLpEffectiveness,loadReceivedLeads,loadRmFollowups],180);
  },300);
}
function lpTestConnection(){
  var started=Date.now();
  setSyncStatus("loading");
  return sbFetch("GET","amanda_activities?select=id&limit=1").then(function(){setSyncStatus("live");return true;}).catch(function(err){
    // If any other Supabase request succeeded after this check began, connectivity is already proven.
    if(lpLastServerSuccessAt>=started){setSyncStatus("live");return true;}
    console.warn("LP connection check:",err);lpHandleSyncError(err);return false;
  });
}
function lpRetryConnection(){
  return lpTestConnection().then(function(ok){
    if(!ok)return false;
    if(document.getElementById("view-snapshot")&&document.getElementById("view-snapshot").classList.contains("active")&&typeof window.lpLoadSnapshotFresh==="function")return window.lpLoadSnapshotFresh({force:true});
    return loadCallLogs().then(function(){if(typeof buildSnapshot==="function")buildSnapshot();return true;});
  });
}
if(typeof window!=="undefined"){
  window.addEventListener("online",function(){lpTestConnection();});
  window.addEventListener("offline",function(){setSyncStatus("offline");});
}


function loadAgents(){
  agents=SEED.map(function(r){return r.slice();});
  try{
    var s=localStorage.getItem(STORAGE_KEY);
    if(s){
      var d=JSON.parse(s);
      if(d.ov)d.ov.forEach(function(o){var a=agents.find(function(x){return x[0]===o.n;});if(a){a[2]=o.lp;if(o.pr!==undefined)a[7]=o.pr;}else if(o.added){agents.push([o.n,o.lv,o.lp,null,null,null,null,o.pr||false,0]);}});
      // Intentionally NOT applying d.rm — removals are now tracked exclusively in
      // Supabase (lp='__REMOVED__') to prevent localStorage drift from hiding agents
      if(d.rm&&d.rm.length){d.rm=[];localStorage.setItem(STORAGE_KEY,JSON.stringify(d));}
    }
  }catch(e){}
}

function saveAgents(){
  var ov=agents.filter(function(a){var s=SEED.find(function(x){return x[0]===a[0];});return!s||s[2]!==a[2]||s[7]!==a[7];}).map(function(a){return{n:a[0],lp:a[2],lv:a[1],pr:a[7],added:!SEED.find(function(s){return s[0]===a[0];})};});
  try{
    var s=localStorage.getItem(STORAGE_KEY);
    var d=s?JSON.parse(s):{};
    d.ov=ov;
    localStorage.setItem(STORAGE_KEY,JSON.stringify(d));
  }catch(e){}
  // Save to Supabase async — don't block or error on failure
  try{
    var rows=ov.map(function(o){return{agent_name:o.n,lp:o.lp,priority:o.pr||false,added:o.added||false,level:o.lv||"C"};});
    if(rows.length)sbFetch("POST","agent_assignments?on_conflict=agent_name",rows).catch(function(){});
  }catch(e){}
}

function loadAgentAssignments(){
  return sbFetch("GET","agent_assignments?select=*&limit=5000").then(function(res){
    agentRmOwners={};
    if(!res||!res.length)return;
    // Stable order prevents duplicate case-variant rows from changing the LP on each reload.
    // A deliberate __REMOVED__ record always wins over legacy active duplicates.
    res=res.slice().sort(function(a,b){
      var ar=a.lp==="__REMOVED__"?1:0,br=b.lp==="__REMOVED__"?1:0;
      return ar-br||(Date.parse(a.updated_at||0)||0)-(Date.parse(b.updated_at||0)||0);
    });
    res.forEach(function(r){
      if(r&&r.agent_name)agentRmOwners[assignmentKey(r.agent_name)]=r.rm||"";
      try{
        if(r.lp==="__REMOVED__"){
          agents=agents.filter(function(a){return assignmentKey(a[0])!==assignmentKey(r.agent_name);});
        } else {
          var key=assignmentKey(r.agent_name);
          var a=agents.find(function(x){return assignmentKey(x[0])===key;});
          if(a){a[2]=r.lp||"Unassigned";a[7]=r.priority||false;if(r.level)a[1]=r.level;if(r.closed_past_year!==undefined&&r.closed_past_year!==null)a[8]=r.closed_past_year;}
          var seedRow=SEED.find(function(x){return assignmentKey(x[0])===key;});
          if(seedRow){seedRow[2]=r.lp||"Unassigned";if(r.level)seedRow[1]=r.level;}
          // Every live assignment belongs in the working roster, even if the row was not created
          // by this page (added=false). This prevents newer/current LP relationships from being
          // invisible simply because they were never baked into the old SEED snapshot.
          if(!a){agents.push([r.agent_name,r.level||"C",r.lp||"Unassigned",null,null,null,null,r.priority||false,r.closed_past_year||0]);}
        }
      }catch(e){}
    });
  }).catch(function(){});
}

var lpPollInterval=null;
function lpStartPolling(lp){ lpStopPolling(); }
function lpStopPolling(){
  if(lpPollInterval){clearInterval(lpPollInterval);lpPollInterval=null;}
}

function selectUser(btn,u){
  rmStopPolling();
  lpStopPolling();
  currentUser=u;
  document.querySelectorAll(".who-btn").forEach(function(b){b.classList.remove("active");});
  if(btn)btn.classList.add("active");
  document.querySelectorAll(".view").forEach(function(v){v.classList.remove("active");});
  if(u==="FaceTime"){
    document.getElementById("view-facetime").classList.add("active");
    loadFaceTime();
  } else if(u==="Admin"){
    document.getElementById("view-admin").classList.add("active");
    renderAdmin();
    loadLpOverrides();
    Promise.all([loadAgentAssignments(),loadInactiveRosterNames()]).then(function(){renderLpAssignList();renderAdmin();loadSystemHealth();renderCoMktList();});
  } else if(u==="Welcome"){
    document.getElementById("view-welcome").classList.add("active");
  } else {
    document.getElementById("view-lp").classList.add("active");
    var lpList=document.getElementById("lp-call-list"),heroName=document.getElementById("lp-hero-name"),heroSub=document.getElementById("lp-hero-sub");
    if(heroName)heroName.textContent=u+"'s calls this week";
    if(heroSub)heroSub.textContent="Syncing shared RM + LP activity before building the call list…";
    if(lpList)lpList.innerHTML='<div class="no-data">Checking the latest team touches and follow-up ownership…</div>';
    Promise.all([loadCallLogs().catch(function(){}),loadRmActivity().catch(function(){}),loadFaceTime().catch(function(){}),loadInactiveRosterNames().catch(function(){})]).then(function(){renderLP(u);if(typeof window.v310LoadPlan==='function'){Promise.resolve(window.v310LoadPlan(u,true)).catch(function(e){console.warn('transaction/pipeline work refresh failed',e);});}});
    lpStartPolling(u);
  }
}

function openScorecardsView(){
  rmStopPolling();lpStopPolling();
  currentUser=null;
  document.querySelectorAll(".who-btn").forEach(function(b){b.classList.remove("active");});
  document.querySelectorAll(".view").forEach(function(v){v.classList.remove("active");});
  document.getElementById("view-scorecards").classList.add("active");
  // Always set sensible date range — recompute fresh every time this view opens,
  // so it never gets stuck on a stale range from an earlier visit or a browser-
  // remembered form value.
  var fromEl=document.getElementById("lpsc-from");
  var toEl=document.getElementById("lpsc-to");
  if(fromEl){var d=new Date(TODAY);d.setDate(d.getDate()-84);while(d.getDay()!==1)d.setDate(d.getDate()-1);fromEl.value=localDateStr(d);}
  if(toEl){toEl.value=localDateStr(TODAY);}
  lpscLoadTeamTotals();
  // Reload whichever person is currently selected, so the visible table always
  // reflects the freshly-computed date range above — not just when Isaak is selected.
  if(lpscCurrentLP==="Isaak"){
    document.getElementById("lpsc-edit-wrap").style.display="block";
    lpscEditMonday=lpscGetMonday(new Date());
    lpscLoadEditWeek();
    lpscLoad();
  }else if(lpscCurrentLP==="Amanda"){
    document.getElementById("lpsc-edit-wrap").style.display="none";
    lpscLoadAmanda();
  }else if(lpscCurrentLP){
    document.getElementById("lpsc-edit-wrap").style.display="block";
    lpscEditMonday=lpscGetMonday(new Date());
    lpscLoadEditWeek();
    lpscLoad();
  }
}


/* ── v39: shared RM + LP ownership workspace with bulk reassignment ── */
var ownershipSelected=new Set();
var ownershipVisibleKeys=[];
function ctOwnEscAttr(v){return String(v==null?"":v).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function ctOwnershipIsHidden(a){
  if(!a)return false;
  var raw=String(a[0]||"").trim().toLowerCase();
  var shown=String(displayName(a[0])||"").trim().toLowerCase();
  return raw==="__hidden__"||shown==="__hidden__"||/^__roster_delete_/i.test(raw)||/^__roster_delete_/i.test(shown);
}
/* v91: Ownership is a roster-management workspace, so its population must match the
   latest Power BI active A/B/C roster. It must NOT use the narrower tracker-managed /
   90-day relationship population. The Sep 24 workbook is 17 A + 20 B + 93 C = 130. */
var ctOwnershipPowerBiKeys=new Set();
async function ctOwnershipLoadPowerBiRoster(){
  var rows=await sbFetch("GET","agent_profiles?select=agent_name,powerbi_level,powerbi_last_seen_at,relationship_status,do_not_contact&powerbi_last_seen_at=not.is.null&limit=5000").catch(function(){return[];});
  var latestMs=0;
  (rows||[]).forEach(function(p){var ms=Date.parse(p&&p.powerbi_last_seen_at||"");if(Number.isFinite(ms)&&ms>latestMs)latestMs=ms;});
  var latestByKey=new Map();
  (rows||[]).forEach(function(p){
    var ms=Date.parse(p&&p.powerbi_last_seen_at||""),lv=String(p&&p.powerbi_level||"").trim().toUpperCase();
    if(!latestMs||!Number.isFinite(ms)||Math.abs(ms-latestMs)>=120000||!["A","B","C"].includes(lv))return;
    var key=assignmentKey(p.agent_name);
    if(!key||/^__roster_delete_/i.test(String(p.agent_name||""))||String(p.relationship_status||"").toLowerCase()==="inactive"||ctRosterRemoved(p.agent_name))return;
    if(!latestByKey.has(key))latestByKey.set(key,p);
  });
  ctOwnershipPowerBiKeys=new Set(latestByKey.keys());
  latestByKey.forEach(function(p,key){
    var a=(agents||[]).find(function(x){return assignmentKey(x[0])===key;});
    if(a){a[1]=String(p.powerbi_level||a[1]||"C").toUpperCase();}
    else{agents.push([p.agent_name,String(p.powerbi_level||"C").toUpperCase(),"Unassigned",null,null,null,null,false,0]);}
  });
  return latestByKey.size;
}
function ctOwnershipBaseRows(){
  return (agents||[]).filter(function(a){
    var key=assignmentKey(a&&a[0]);
    return ctOwnershipPowerBiKeys.has(key)&&!ctOwnershipIsHidden(a)&&!ctRosterRemoved(a[0]);
  });
}
function ctOwnershipHiddenRows(){
  return (agents||[]).filter(function(a){return isActive(a)&&ctOwnershipIsHidden(a);});
}
function openOwnershipView(btn){
  rmStopPolling();lpStopPolling();
  currentUser="Ownership";
  document.querySelectorAll(".who-btn").forEach(function(b){b.classList.remove("active");});
  if(btn)btn.classList.add("active");
  document.querySelectorAll(".view").forEach(function(v){v.classList.remove("active");});
  var view=document.getElementById("view-ownership");if(view)view.classList.add("active");
  var body=document.getElementById("ownership-body");if(body)body.innerHTML='<div style="padding:30px;text-align:center;color:var(--text-3)">Loading ownership...</div>';
  Promise.all([loadAgentAssignments(),loadInactiveRosterNames(),ctOwnershipLoadPowerBiRoster()]).then(function(){renderOwnershipSummary();renderOwnershipRows();}).catch(function(){renderOwnershipRows();});
}
function refreshOwnershipView(){
  var body=document.getElementById("ownership-body");if(body)body.innerHTML='<div style="padding:30px;text-align:center;color:var(--text-3)">Refreshing...</div>';
  return Promise.all([loadAgentAssignments(),loadInactiveRosterNames(),ctOwnershipLoadPowerBiRoster()]).then(function(){renderOwnershipSummary();renderOwnershipRows();setSyncStatus("live");}).catch(function(err){lpHandleSyncError(err);console.error("Ownership load failed:",err);renderOwnershipRows();});
}
function renderOwnershipSummary(){
  var host=document.getElementById("ownership-summary");if(!host)return;
  var rows=ctOwnershipBaseRows();
  var counts={total:rows.length,Amanda:0,Nyny:0,rmU:0,lpU:0};
  rows.forEach(function(a){var rm=getRmOwner(a[0]);if(rm==="Amanda")counts.Amanda++;else if(rm==="Nyny")counts.Nyny++;else counts.rmU++;if(!a[2]||a[2]==="Unassigned")counts.lpU++;});
  function card(label,val){return '<div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:10px 12px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;font-weight:800;color:var(--text-3)">'+label+'</div><div style="font-size:20px;font-weight:800;color:var(--text);margin-top:3px">'+val+'</div></div>';}
  host.innerHTML=card("Active relationships",counts.total)+card("RM · Amanda",counts.Amanda)+card("RM · Nyny",counts.Nyny)+card("RM unassigned",counts.rmU)+card("LP unassigned",counts.lpU);
  var note=document.getElementById("ownership-hidden-note"),hidden=ctOwnershipHiddenRows();
  if(note){
    if(hidden.length){
      note.style.display="block";
      note.innerHTML='<strong>'+hidden.length+' old hidden placeholder'+(hidden.length===1?'':'s')+' excluded.</strong> These are legacy cleanup records, not real agent names. <button class="btn btn-sm" type="button" onclick="cleanupHiddenOwnershipPlaceholders()" style="margin-left:7px;padding:4px 8px">Remove them permanently</button>';
    }else{note.style.display="none";note.innerHTML="";}
  }
}
function renderOwnershipBulkStatus(){
  var count=ownershipSelected.size,el=document.getElementById("ownership-selected-count"),btn=document.getElementById("ownership-bulk-apply"),deleteBtn=document.getElementById("ownership-bulk-delete");
  if(el)el.textContent=count+" selected";
  if(btn)btn.disabled=count===0;
  if(deleteBtn)deleteBtn.disabled=count===0;
  var all=document.getElementById("ownership-select-all");
  if(all){var visibleSelected=ownershipVisibleKeys.filter(function(k){return ownershipSelected.has(k);}).length;all.checked=ownershipVisibleKeys.length>0&&visibleSelected===ownershipVisibleKeys.length;all.indeterminate=visibleSelected>0&&visibleSelected<ownershipVisibleKeys.length;}
}
function toggleOwnershipRow(cb){
  var key=cb&&cb.getAttribute("data-own-key");if(!key)return;
  if(cb.checked)ownershipSelected.add(key);else ownershipSelected.delete(key);
  renderOwnershipBulkStatus();
}
function toggleOwnershipSelectAll(cb){
  ownershipVisibleKeys.forEach(function(k){if(cb.checked)ownershipSelected.add(k);else ownershipSelected.delete(k);});
  document.querySelectorAll('#ownership-body input[data-own-key]').forEach(function(x){x.checked=cb.checked;});
  renderOwnershipBulkStatus();
}
function clearOwnershipSelection(){
  ownershipSelected.clear();
  document.querySelectorAll('#ownership-body input[data-own-key]').forEach(function(x){x.checked=false;});
  renderOwnershipBulkStatus();
  var st=document.getElementById("ownership-bulk-status");if(st)st.textContent="";
}
function renderOwnershipRows(){
  var host=document.getElementById("ownership-body");if(!host)return;
  var q=((document.getElementById("ownership-search")||{}).value||"").trim().toLowerCase();
  var rf=((document.getElementById("ownership-rm-filter")||{}).value||"");
  var lf=((document.getElementById("ownership-lp-filter")||{}).value||"");
  var sortMode=((document.getElementById("ownership-sort")||{}).value||"unassigned");
  var rows=ctOwnershipBaseRows().filter(function(a){
    var rm=getRmOwner(a[0])||"",lp=a[2]||"Unassigned",dn=displayName(a[0]);
    if(q && (dn+" "+a[0]+" "+rm+" "+lp).toLowerCase().indexOf(q)===-1)return false;
    if(rf==="__UNASSIGNED__" && rm)return false;if(rf && rf!=="__UNASSIGNED__" && rm!==rf)return false;
    if(lf && lp!==lf)return false;return true;
  }).sort(function(a,b){
    var arm=getRmOwner(a[0])||"",brm=getRmOwner(b[0])||"",alp=a[2]||"Unassigned",blp=b[2]||"Unassigned";
    if(sortMode==="unassigned"){
      var as=(arm?0:2)+(alp==="Unassigned"?1:0),bs=(brm?0:2)+(blp==="Unassigned"?1:0);
      if(as!==bs)return bs-as;
    }else if(sortMode==="rm"){
      var arv=arm||"ZZZ Unassigned",brv=brm||"ZZZ Unassigned";if(arv!==brv)return arv.localeCompare(brv);
    }else if(sortMode==="lp"){
      var alv=alp==="Unassigned"?"ZZZ Unassigned":alp,blv=blp==="Unassigned"?"ZZZ Unassigned":blp;if(alv!==blv)return alv.localeCompare(blv);
    }
    return displayName(a[0]).localeCompare(displayName(b[0]));
  });
  ownershipVisibleKeys=rows.map(function(a){return assignmentKey(a[0]);});
  if(!rows.length){host.innerHTML='<div style="padding:30px;text-align:center;color:var(--text-3)">No relationships match those filters.</div>';renderOwnershipBulkStatus();return;}
  var rmOptions='<option value="">Unassigned</option><option value="Amanda">Amanda</option><option value="Nyny">Nyny</option>';
  var lpOptions='<option value="Unassigned">Unassigned</option><option value="Gavin">Gavin</option><option value="Karen">Karen</option><option value="Osgood">Osgood</option><option value="Jordan">Jordan</option><option value="Said">Said</option><option value="Isaak">Isaak</option>';
  var html='<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:760px"><thead><tr style="background:var(--surface-2);text-align:left"><th style="padding:10px 8px;width:32px;text-align:center"><input id="ownership-select-all" type="checkbox" onchange="toggleOwnershipSelectAll(this)" title="Select all visible"></th><th style="padding:10px 8px;font-size:10px;text-transform:uppercase;color:var(--text-3)">Agent</th><th style="padding:10px 8px;font-size:10px;text-transform:uppercase;color:var(--text-3)">Tier</th><th style="padding:10px 8px;font-size:10px;text-transform:uppercase;color:var(--text-3)">RM Owner</th><th style="padding:10px 8px;font-size:10px;text-transform:uppercase;color:var(--text-3)">LP Owner</th><th style="padding:10px 12px"></th></tr></thead><tbody>';
  rows.forEach(function(a){
    var name=a[0],rm=getRmOwner(name)||"",lp=a[2]||"Unassigned",key=assignmentKey(name),checked=ownershipSelected.has(key)?' checked':'';
    html+='<tr data-agent="'+ctOwnEscAttr(name)+'" style="border-top:1px solid var(--border)"><td style="padding:10px 8px;text-align:center"><input type="checkbox" data-own-key="'+ctOwnEscAttr(key)+'" onchange="toggleOwnershipRow(this)"'+checked+'></td><td style="padding:10px 8px"><div style="font-size:12.5px;font-weight:750;color:var(--text)">'+escHtml(displayName(name))+'</div><button class="btn btn-sm" type="button" onclick="deleteOwnershipRow(this)" style="display:inline-block;margin-top:6px;color:#a32020;background:#fff5f5;border:1px solid #dc9a9a;font-weight:700;padding:5px 10px">Remove agent</button></td><td style="padding:10px 8px"><span style="font-size:10px;font-weight:800;padding:3px 7px;border-radius:999px;background:#f4f1fb;color:#5b4498">'+escHtml(a[1]||"C")+'</span></td><td style="padding:8px"><select data-owner-role="rm" style="width:100%;min-width:120px;padding:7px 8px;border:1px solid var(--border);border-radius:7px;font:inherit;font-size:11.5px">'+rmOptions+'</select></td><td style="padding:8px"><select data-owner-role="lp" style="width:100%;min-width:120px;padding:7px 8px;border:1px solid var(--border);border-radius:7px;font:inherit;font-size:11.5px">'+lpOptions+'</select></td><td style="padding:8px 12px;text-align:right;white-space:nowrap"><button class="btn btn-sm ownership-save-btn" type="button" onclick="saveOwnershipRow(this)">Save</button><button class="btn btn-sm" type="button" onclick="openLpContactModal(this.closest(\'tr\').getAttribute(\'data-agent\'))" style="margin-left:5px">Contact</button><span class="ownership-row-status" style="display:inline-block;min-width:42px;margin-left:6px;font-size:10.5px;color:var(--text-3)"></span></td></tr>';
  });
  host.innerHTML=html+'</tbody></table></div>';
  host.querySelectorAll('tr[data-agent]').forEach(function(tr){var name=tr.getAttribute('data-agent'),a=agents.find(function(x){return assignmentKey(x[0])===assignmentKey(name);});var rm=getRmOwner(name)||"",lp=(a&&a[2])||"Unassigned";var rs=tr.querySelector('select[data-owner-role="rm"]'),ls=tr.querySelector('select[data-owner-role="lp"]');if(rs)rs.value=rm;if(ls)ls.value=lp;});
  renderOwnershipBulkStatus();
}
function saveOwnershipRow(btn){
  var tr=btn&&btn.closest?btn.closest('tr[data-agent]'):null;if(!tr)return;
  var name=tr.getAttribute('data-agent'),rmSel=tr.querySelector('select[data-owner-role="rm"]'),lpSel=tr.querySelector('select[data-owner-role="lp"]'),status=tr.querySelector('.ownership-row-status');
  var rmVal=rmSel?rmSel.value:"",lpVal=lpSel?lpSel.value:"Unassigned";
  btn.disabled=true;btn.textContent="Saving...";if(status){status.textContent="";status.style.color="var(--text-3)";}setSyncStatus("saving");
  sbFetch("GET","agent_assignments?agent_name=ilike."+encodeURIComponent(name)+"&select=*&limit=5").catch(function(){return[];}).then(function(rows){
    var ar=(rows||[]).find(function(r){return assignmentKey(r.agent_name)===assignmentKey(name);})||(rows||[])[0]||{};
    var ag=(agents||[]).find(function(a){return assignmentKey(a[0])===assignmentKey(name);});
    var payload={agent_name:ar.agent_name||name,lp:lpVal||"Unassigned",rm:rmVal||null,priority:ar.priority!==undefined?!!ar.priority:!!(ag&&ag[7]),added:ar.added!==undefined?!!ar.added:false,level:ar.level||(ag&&ag[1])||"C"};
    if(ar.closed_past_year!==undefined)payload.closed_past_year=ar.closed_past_year;else if(ag&&ag[8]!==undefined)payload.closed_past_year=ag[8];
    return sbFetch("POST","agent_assignments?on_conflict=agent_name",payload);
  }).then(function(){
    agentRmOwners[assignmentKey(name)]=rmVal||"";var ag=(agents||[]).find(function(a){return assignmentKey(a[0])===assignmentKey(name);});if(ag)ag[2]=lpVal||"Unassigned";
    setSyncStatus("live");btn.textContent="Saved";if(status){status.textContent="✓";status.style.color="#15803d";}renderOwnershipSummary();setTimeout(function(){btn.textContent="Save";btn.disabled=false;if(status)status.textContent="";},1200);
  }).catch(function(err){console.error("Ownership save failed",err);lpHandleSyncError(err);btn.disabled=false;btn.textContent="Retry";if(status){status.textContent="Failed";status.style.color="#b42318";}});
}
async function bulkApplyOwnership(){
  var rmChoice=(document.getElementById("ownership-bulk-rm")||{}).value||"__NO_CHANGE__";
  var lpChoice=(document.getElementById("ownership-bulk-lp")||{}).value||"__NO_CHANGE__";
  var st=document.getElementById("ownership-bulk-status"),btn=document.getElementById("ownership-bulk-apply");
  if(!ownershipSelected.size)return;
  if(rmChoice==="__NO_CHANGE__"&&lpChoice==="__NO_CHANGE__"){if(st){st.textContent="Choose an RM or LP change first.";st.style.color="#9a3412";}return;}
  var selected=ctOwnershipBaseRows().filter(function(a){return ownershipSelected.has(assignmentKey(a[0]));});
  if(!selected.length){clearOwnershipSelection();return;}
  if(btn){btn.disabled=true;btn.textContent="Saving "+selected.length+"...";}if(st){st.textContent="";st.style.color="var(--text-3)";}setSyncStatus("saving");
  try{
    var existing=await sbFetch("GET","agent_assignments?select=*&limit=5000").catch(function(){return[];});
    var amap={};(existing||[]).forEach(function(r){if(r.agent_name)amap[assignmentKey(r.agent_name)]=r;});
    var payloads=selected.map(function(ag){
      var name=ag[0],k=assignmentKey(name),ar=amap[k]||{};
      var newRm=rmChoice==="__NO_CHANGE__"?(getRmOwner(name)||null):(rmChoice==="__UNASSIGNED__"?null:rmChoice);
      var newLp=lpChoice==="__NO_CHANGE__"?(ag[2]||"Unassigned"):lpChoice;
      var p={agent_name:ar.agent_name||name,lp:newLp||"Unassigned",rm:newRm,priority:ar.priority!==undefined?!!ar.priority:!!ag[7],added:ar.added!==undefined?!!ar.added:false,level:ar.level||ag[1]||"C"};
      if(ar.closed_past_year!==undefined)p.closed_past_year=ar.closed_past_year;else if(ag[8]!==undefined)p.closed_past_year=ag[8];
      return p;
    });
    await sbFetch("POST","agent_assignments?on_conflict=agent_name",payloads);
    payloads.forEach(function(p){var k=assignmentKey(p.agent_name);agentRmOwners[k]=p.rm||"";var ag=(agents||[]).find(function(a){return assignmentKey(a[0])===k;});if(ag)ag[2]=p.lp||"Unassigned";});
    var changed=payloads.length;ownershipSelected.clear();
    if(st){st.textContent=changed+" relationship"+(changed===1?"":"s")+" updated ✓";st.style.color="#15803d";}
    setSyncStatus("live");renderOwnershipSummary();renderOwnershipRows();
    if(btn){btn.textContent="Apply to selected";btn.disabled=true;}
  }catch(err){console.error("Bulk ownership update failed",err);lpHandleSyncError(err);if(st){st.textContent="Bulk update failed — nothing was intentionally cleared.";st.style.color="#b42318";}if(btn){btn.disabled=false;btn.textContent="Retry bulk update";}}
}
/* Ownership removal is a reversible roster deactivation, not a deletion of historical production.
   Never delete underlying Power BI source rows or activity/lead history. */
async function ctOwnershipRemoveNames(names){
  names=Array.from(new Set((names||[]).map(function(n){return String(n||"").trim();}).filter(Boolean)));
  if(!names.length)return;
  var matches=ctOwnershipBaseRows().filter(function(a){return names.some(function(n){return assignmentKey(n)===assignmentKey(a[0]);});});
  if(matches.length!==names.length){alert("Ownership roster changed. Refresh before removing.");return;}
  var shown=matches.map(function(a){return String(a[0]);});
  var message="Remove "+shown.length+" selected agent"+(shown.length===1?"":"s")+" from the active Core Team and RM ownership rosters?\n\n"+shown.slice(0,10).join("\n")+(shown.length>10?"\n... and "+(shown.length-10)+" more":"")+"\n\nThis preserves historical leads, closings and activities. It marks profiles inactive and clears active assignments. A future Power BI import will not automatically reactivate them.";
  if(!window.confirm(message))return;
  var status=document.getElementById("ownership-bulk-status"),deleteBtn=document.getElementById("ownership-bulk-delete");
  if(deleteBtn){deleteBtn.disabled=true;deleteBtn.textContent="Removing...";}
  if(status){status.textContent="Removing "+shown.length+"...";status.style.color="var(--text-3)";}
  var removed=[],failed=[];
  for(var i=0;i<shown.length;i++){
    var name=shown[i];
    try{
      var canonicalName=(await resolveCanonicalProfileName(name))||name;
      // Both persistence updates must succeed before a row disappears from the UI.
      await sbFetch("PATCH","agent_profiles?agent_name=eq."+encodeURIComponent(canonicalName),{relationship_status:"inactive"});
      var existing=await sbFetch("GET","agent_assignments?agent_name=ilike."+encodeURIComponent(canonicalName)+"&select=agent_name,lp&limit=10");
      var assignment=(existing||[]).find(function(a){return assignmentKey(a.agent_name)===assignmentKey(canonicalName);});
      if(assignment){
        await sbFetch("PATCH","agent_assignments?agent_name=eq."+encodeURIComponent(assignment.agent_name),{lp:"__REMOVED__",rm:null,priority:false});
      }else{
        await sbFetch("POST","agent_assignments?on_conflict=agent_name",{agent_name:canonicalName,lp:"__REMOVED__",rm:null,priority:false,added:false,level:(matches.find(function(a){return assignmentKey(a[0])===assignmentKey(name);})||[])[1]||"C"});
      }
      if(typeof clearAgentFromRmWorkflows==="function")await clearAgentFromRmWorkflows(canonicalName).catch(function(err){console.warn("RM workflow cleanup warning",err);});
      ctInactiveRosterNames.add(canonicalName.trim().toLowerCase());
      ctInactiveRosterNames.add(name.trim().toLowerCase());
      ctOwnershipPowerBiKeys.delete(assignmentKey(name));
      ownershipSelected.delete(assignmentKey(name));
      agents=agents.filter(function(a){return assignmentKey(a[0])!==assignmentKey(name);});
      delete agentRmOwners[assignmentKey(name)];
      removed.push(name);
    }catch(err){
      console.error("Ownership removal failed for",name,err);
      failed.push(name);
    }
  }
  try{await refreshOwnershipView();}catch(err){console.warn("Ownership refresh after removal failed",err);}
  if(status){status.textContent=removed.length+" removed"+(failed.length?" · "+failed.length+" failed (retry after refresh)":"")+"; history retained.";status.style.color=failed.length?"#a32020":"#15803d";}
  if(deleteBtn){deleteBtn.textContent="Remove selected";deleteBtn.disabled=ownershipSelected.size===0;}
  if(failed.length)alert("Could not remove: "+failed.join(", ")+". These records were not intentionally hidden. Please refresh and retry.");
}
async function deleteOwnershipRow(btn){
  var tr=btn&&btn.closest?btn.closest('tr[data-agent]'):null;
  if(!tr)return;
  await ctOwnershipRemoveNames([tr.getAttribute("data-agent")]);
}
async function deleteSelectedOwnership(){
  var names=ctOwnershipBaseRows().filter(function(a){return ownershipSelected.has(assignmentKey(a[0]));}).map(function(a){return a[0];});
  await ctOwnershipRemoveNames(names);
}
async function cleanupHiddenOwnershipPlaceholders(){
  var note=document.getElementById("ownership-hidden-note");
  try{
    var profiles=await sbFetch("GET","agent_profiles?select=agent_name,display_name,relationship_status&limit=5000").catch(function(){return[];});
    var hidden=(profiles||[]).filter(function(r){return String(r.display_name||"").trim().toLowerCase()==="__hidden__"||String(r.agent_name||"").trim().toLowerCase()==="__hidden__";});
    if(!hidden.length){if(note){note.textContent="No hidden placeholders remain.";}return;}
    if(!window.confirm("Remove "+hidden.length+" hidden placeholder record"+(hidden.length===1?"":"s")+" from the active relationship roster? The tracker keeps historical activity and production."))return;
    if(note)note.innerHTML="Cleaning up hidden placeholders...";
    var assigns=await sbFetch("GET","agent_assignments?select=*&limit=5000").catch(function(){return[];});
    var amap={};(assigns||[]).forEach(function(r){if(r.agent_name)amap[assignmentKey(r.agent_name)]=r;});
    for(var i=0;i<hidden.length;i++){
      var name=hidden[i].agent_name;if(!name)continue;
      await sbFetch("PATCH","agent_profiles?agent_name=eq."+encodeURIComponent(name),{relationship_status:"inactive",display_name:null}).catch(function(e){console.warn("Hidden profile cleanup failed",e);});
      var ar=amap[assignmentKey(name)];
      if(ar){await sbFetch("PATCH","agent_assignments?agent_name=eq."+encodeURIComponent(ar.agent_name),{lp:"__REMOVED__",priority:false}).catch(function(e){console.warn("Hidden assignment cleanup failed",e);});}
      else{await sbFetch("POST","agent_assignments?on_conflict=agent_name",{agent_name:name,lp:"__REMOVED__",rm:null,priority:false,added:false,level:"C"}).catch(function(e){console.warn("Hidden assignment create failed",e);});}
      if(typeof clearAgentFromRmWorkflows==="function")await clearAgentFromRmWorkflows(name).catch(function(){});
      ctInactiveRosterNames.add(String(name).trim().toLowerCase());
      delete ctDisplayNames[String(name).trim().toLowerCase()];
      agents=agents.filter(function(a){return assignmentKey(a[0])!==assignmentKey(name);});
    }
    await refreshOwnershipView();
    if(note){note.style.display="block";note.textContent=hidden.length+" hidden placeholder"+(hidden.length===1?"":"s")+" removed ✓";setTimeout(function(){renderOwnershipSummary();},1800);}
  }catch(err){console.error("Hidden placeholder cleanup failed",err);if(note){note.style.display="block";note.textContent="Could not clean hidden placeholders. Refresh and try again.";}}
}
function ctOpenOwnershipEdit(ev,name){if(ev){ev.preventDefault();ev.stopPropagation();}openLpContactModal(name);}

function calcStreak(lp){
  var streak=0,dt=new Date(TODAY);dt.setDate(dt.getDate()-7);
  for(var i=0;i<52;i++){
    var wk=getWeekKey(dt);
    var lpCallsInWeek=Object.values(callLogs).filter(function(l){return l.lp===lp&&l.week_key===wk;}).length+
                      Object.values(lastWeekLogs).filter(function(l){return l.lp===lp&&l.week_key===wk;}).length;
    if(lpCallsInWeek>=WEEKLY_TARGET)streak++;else break;
    dt.setDate(dt.getDate()-7);
  }
  return streak;
}

function renderLP(lp){
  // Save scroll position + focused element before re-render
  var _scrollY=window.scrollY;
  var _focusId=document.activeElement?document.activeElement.getAttribute("data-name"):null;
  // Preserve draft text from any open note fields before re-render
  document.querySelectorAll(".note-field").forEach(function(ta){
    var n=ta.getAttribute("data-name");
    if(n&&pendingNote[n]&&ta.value)pendingNote[n].draft=ta.value;
  });
  var all=agents.filter(function(a){return a[2]===lp&&ctRosterEligible(a);});
  var ac=all.filter(isActive).length,ic=all.filter(function(a){return!isActive(a);}).length;
  var pc=all.filter(function(a){return isPriority(a)&&isActive(a);}).length;
  var coordHolds=all.filter(function(a){return isActive(a)&&!calledThisWeek(a[0])&&!!lpRmCoordinationHold(a);}).length;
  document.getElementById("lp-hero-name").textContent=lp+"'s calls this week";
  document.getElementById("lp-hero-sub").textContent=ac+" active / "+ic+" inactive"+(pc?" / "+pc+" priority":"")+(coordHolds?" / "+coordHolds+" team-coordinated hold"+(coordHolds===1?"":"s"):"");
  var done=getLpCallsThisWeek(lp);
  var heroTarget=getLpTotalTargetThisWeek(lp);
  var pct=Math.min(100,Math.round(done/heroTarget*100));
  var bar=document.getElementById("lp-prog");
  bar.style.width=pct+"%";bar.style.background=pct===100?"#43A047":pct>50?"#FB8C00":"#E53935";
  document.getElementById("lp-prog-txt").textContent=done+"/"+heroTarget+(done>heroTarget?" 🎉":"");
  var mondayBanner=document.getElementById("monday-banner-el");
  if(mondayBanner){
    var day=TODAY.getDay();
    if(day===1){mondayBanner.style.display="block";mondayBanner.textContent="📅 New week! Start with your 15 prioritized agents.";}
    else{
      var daysUntilMonday=day===0?1:8-day;
      mondayBanner.style.display="block";
      mondayBanner.style.background="var(--bg)";mondayBanner.style.borderColor="var(--border)";mondayBanner.style.color="var(--text-3)";
      mondayBanner.textContent="🔄 List resets Monday (" + daysUntilMonday + " day"+(daysUntilMonday!==1?"s":"")+") — completed outreach workflows count toward your 15 (live answer or VM + follow-up text).";
    }
  }
  var missedAgents=getLpMissedLastWeek(lp).filter(function(a){return isActive(a);});
  var incomplete=missedAgents.length;
  var totalTarget=getLpTotalTargetThisWeek(lp);
  var carryEl=document.getElementById("carryover-banner-el");
  var carryListEl=document.getElementById("carryover-list-el");
  if(carryEl){
    if(incomplete>0){
      carryEl.style.display="flex";
      carryEl.style.cursor="pointer";
      carryEl.setAttribute("data-lp",lp);
      carryEl.onclick=function(){toggleCarryoverList(this.getAttribute("data-lp"));};
      var actualCarryover=totalTarget-WEEKLY_TARGET;
      carryEl.innerHTML="⚠️ You have <b>"+incomplete+" incomplete outreach"+(incomplete>1?"s":"")+"</b> from last week. Your target this week: <b>"+totalTarget+" total</b> ("+WEEKLY_TARGET+" new + "+actualCarryover+" carryover"+(incomplete>actualCarryover?" — capped at your active roster":"")+"). <span style=\"margin-left:auto;font-size:11px;font-weight:700;text-decoration:underline\">View carryover focus ▾</span>";
    } else {
      carryEl.style.display="none";
      carryEl.onclick=null;
    }
  }
  if(carryListEl){carryListEl.style.display="none";carryListEl.innerHTML="";}
  var targetEl=document.getElementById("target-complete-el");
  targetEl.style.display=done>=WEEKLY_TARGET?"flex":"none";
  var streak=calcStreak(lp);
  var sb=document.getElementById("streak-bar-el");
  if(streak>=1){sb.style.display="flex";sb.innerHTML="&#128293; "+streak+" week streak! Keep it going "+lp+"!";}
  else sb.style.display="none";
  var rot=getRotation(lp);
  document.getElementById("priority-banner").style.display=rot.some(function(a){return isPriority(a)&&!calledThisWeek(a[0]);})?"flex":"none";
  var ib=document.getElementById("inactive-banner");
  if(ic>0){ib.style.display="flex";ib.style.cursor="pointer";ib.title="Click to see inactive agents";ib.onclick=function(){showLpInactiveAgents(lp);};document.getElementById("inactive-banner-txt").textContent=ic+" agents hit 90+ days without activity. Review inactive relationships.";}
  else {ib.style.display="none";ib.onclick=null;}
  var bdayEl=document.getElementById("bday-banner");
  if(bdayEl){
    var bdayAgents=getBirthdayAgentsThisWeek().filter(function(b){var ag=agents.find(function(a){return a[0]===b.name;});return ag&&ag[2]===lp;});
    if(bdayAgents.length){bdayEl.style.display="flex";document.getElementById("bday-banner-txt").textContent="Birthday this week: "+bdayAgents.map(function(b){return b.name+" ("+b.birthday+")";}).join(", ")+" — reach out!";}
    else bdayEl.style.display="none";
  }
  if(typeof renderLpFaceTimeFocus==="function")renderLpFaceTimeFocus(lp);
  if(typeof ctLoadRmFlagsForLp==="function")ctLoadRmFlagsForLp(lp);
  if(typeof ctLoadRecentRmResponses==="function")ctLoadRecentRmResponses(lp);
  if(typeof ctLoadRecentRmRelationshipNotes==="function")ctLoadRecentRmRelationshipNotes(lp);
  document.getElementById("lp-search-input").value="";
  document.getElementById("lp-search-results").innerHTML="";
  var el=document.getElementById("lp-call-list"),html="";
  if(!rot.length){el.innerHTML='<div class="no-data">No active agents in rotation.</div>';return;}
  var targetHit=done>=totalTarget;
  if(targetHit){
    // Target hit — only show who they called this week
    var calledAgents=rot.filter(function(a){return calledThisWeek(a[0]);});
    // Also grab any called via search that aren't in top rotation
    var allCalledThisWeek=Object.values(callLogs).filter(function(l){return l.lp===lp&&l.week_key===weekKey;});
    var calledNames=calledAgents.map(function(a){return a[0];});
    allCalledThisWeek.forEach(function(l){
      if(calledNames.indexOf(l.agent_name)<0){
        var a=agents.find(function(x){return x[0]===l.agent_name;})||[l.agent_name,"C",lp,null,null,null,null,false,0];
        calledAgents.push(a);calledNames.push(l.agent_name);
      }
    });
    if(calledAgents.length){
      html+='<div class="section-head" style="margin-top:.25rem">Worked this week ('+calledAgents.length+')</div>';
      calledAgents.forEach(function(a){html+=renderCallCard(a,lp,false);});
    }
    var uncalledCount=rot.length-calledAgents.length;
    if(uncalledCount>0){
      html+='<div style="text-align:center;padding:1.25rem;background:var(--surface);border:1px solid var(--border);border-radius:10px;margin-top:8px">';
      html+='<div style="font-size:13px;font-weight:600;color:var(--text-2);margin-bottom:4px">'+uncalledCount+' agents not yet fully worked this week</div>';
      html+='<div style="font-size:12px;color:var(--text-3)">You hit your '+totalTarget+'! Use search above to log any additional calls.</div>';
      html+='</div>';
    }
  } else {
    // Before target — show called agents + top uncalled up to 15 total
    var calledThisWk=rot.filter(function(a){return calledThisWeek(a[0]);});
    var uncalledRot=rot.filter(function(a){return!calledThisWeek(a[0]);});
    var slotsLeft=Math.max(0,totalTarget-calledThisWk.length);
    var showList=calledThisWk.concat(uncalledRot.slice(0,slotsLeft));
    showList.forEach(function(a){html+=renderCallCard(a,lp,false);});
    var remaining=uncalledRot.length-slotsLeft;
    if(remaining>0){
      html+='<div style="text-align:center;padding:1rem;background:var(--bg);border:1px solid var(--border);border-radius:10px;margin-top:8px">';
      html+='<div style="font-size:12px;color:var(--text-3)">'+remaining+' more agents — complete your '+totalTarget+' first, then they\'ll appear next week.</div>';
      html+='</div>';
    }
  }
  el.innerHTML=html;
  var toLoad=targetHit?rot:rot.slice(0,totalTarget);
  toLoad.forEach(function(a){loadAgentContact(a[0],a[0].replace(/\s+/g,'_'));});
  if(targetHit){
    var allCalled2=Object.values(callLogs).filter(function(l){return l.lp===lp&&l.week_key===weekKey;});
    allCalled2.forEach(function(l){loadAgentContact(l.agent_name,l.agent_name.replace(/\s+/g,'_'));});
  }
  // Restore scroll position and re-focus the active note field
  setTimeout(function(){
    window.scrollTo(0,_scrollY);
    if(_focusId){
      var ta=document.querySelector('.note-field[data-name="'+_focusId+'"]');
      if(ta){ta.focus();try{var pos=_focusPos!==null?_focusPos:ta.value.length;ta.setSelectionRange(pos,pos);}catch(e){}}
    }
  },0);
}


function ctGetCurrentPowerBiSnapshot(){
 // Browser data never overrides the last verified shared-server import.
 return window.__ctVerifiedSharedPowerBiSnapshot||null;
}
function ctPowerBiActiveCount(snapshot){
  var s=snapshot||ctGetCurrentPowerBiSnapshot()||{},l=s.levels||{};
  return Number(l.A||0)+Number(l.B||0)+Number(l.C||0);
}

// v67 — server-backed Power BI roster summary. Browser localStorage is useful for detailed
// prequal/pipeline drilldowns, but it must never be the authority for current Active Agent
// or Relationship Tier counts. Rebuild those counts from the latest shared profile stamp.
var CT_LIVE_PB_CACHE={at:0,data:null,promise:null};
function ctCurrentRelationshipMilestone(){
  var m=new Date().getMonth()+1;
  if(m<=9)return{label:'9/30 Target',Channel:2,A:14,B:21};
  if(m===10)return{label:'10/31 Target',Channel:2,A:16,B:24};
  if(m===11)return{label:'11/30 Target',Channel:3,A:18,B:27};
  return{label:'12/31 Goal',Channel:4,A:20,B:30};
}
// Legacy November 9 Power BI receipt includes four user-confirmed excluded rows.
// The raw source remains 136 for audit; official tier counts are the 132 stamped profiles.
function ctIsAcknowledgedNov9RosterExclusion(raw,profiles,a,b,c,stamp){
 // Exact approved November 9 source receipt only; do not waive mismatches for future uploads.
 return Number(raw)===136&&Number(profiles)===131&&Number(a)===16&&Number(b)===21&&Number(c)===94&&
   String(stamp||"").startsWith("2026-11-09T16:48:39.629");
}
function ctRelTierFromProduction(p){var c=Number(p&&p.closes_past_year||0)||0,l=Number(p&&p.total_leads_past_year||0)||0;return c>=10?'Channel':c>=4?'A':c>=2?'B':(c>=1||l>=1)?'C':null}
function ctPowerBiWarning(message){
 let e=document.getElementById('ctSharedPowerBiWarning');
 if(!message){if(e)e.remove();return;}
 if(!e){e=document.createElement('div');e.id='ctSharedPowerBiWarning';e.setAttribute('role','alert');e.style.cssText='position:sticky;top:0;z-index:9999;background:#FFF3DC;border:2px solid #DB9B28;color:#704509;text-align:center;font-weight:700;padding:10px 14px';document.body.prepend(e);}
 e.textContent='⚠ Shared data refresh unavailable: '+message+' · Refresh to retry. Counts are not verified.';
}
async function ctGetLivePowerBiSummary(force){
 if(!force&&CT_LIVE_PB_CACHE.data&&Date.now()-CT_LIVE_PB_CACHE.at<45000)return CT_LIVE_PB_CACHE.data;
 if(CT_LIVE_PB_CACHE.promise)return CT_LIVE_PB_CACHE.promise;
 CT_LIVE_PB_CACHE.promise=(async function(){
  try{
   const [rows,logs]=await Promise.all([
    sbFetch('GET','agent_profiles?select=agent_name,powerbi_level,powerbi_last_seen_at,closes_past_year,total_leads_past_year,relationship_status,do_not_contact&powerbi_last_seen_at=not.is.null&limit=5000'),
    sbFetch('GET','powerbi_import_log?select=imported_at,source_app,rows_processed,errors&source_app=like.core-team-tracker%25&order=imported_at.desc&limit=1')
   ]);
   const receipt=logs&&logs[0];
   if(!receipt||String(receipt.errors||'0')!=='0')throw new Error('Missing successful shared import receipt');
   const sourceText=String(receipt.source_app||'');
   const metadata={};
   sourceText.split(';').slice(1).forEach(p=>{const i=p.indexOf('=');if(i>0)metadata[p.slice(0,i)]=p.slice(i+1);});
   const stamp=metadata.profileStamp?decodeURIComponent(metadata.profileStamp):receipt.imported_at;
   const ms=Date.parse(stamp),expected=Number(receipt.rows_processed);
   if(!Number.isFinite(ms)||!Number.isInteger(expected)||expected<1)throw new Error('Invalid shared Power BI receipt');
   const by=new Map();
   (rows||[]).forEach(p=>{const time=Date.parse(p&&p.powerbi_last_seen_at||'');if(!Number.isFinite(time)||Math.abs(time-ms)>=1000)return;const key=String(p.agent_name||'').trim().toLowerCase().replace(/\s+/g,' ');if(key)by.set(key,p);});
   var tierActual={A:0,B:0,C:0};by.forEach(p=>{var lv=String(p.powerbi_level||'').trim().toUpperCase();if(tierActual[lv]!==undefined)tierActual[lv]++});
   var acknowledged=ctIsAcknowledgedNov9RosterExclusion(expected,by.size,tierActual.A,tierActual.B,tierActual.C,stamp);
   if(by.size!==expected&&!acknowledged)throw new Error('Import has '+by.size+' of '+expected+' verified profiles');
   const current=Array.from(by.values()),source={A:0,B:0,C:0},rel={Channel:0,A:0,B:0,C:0};
   current.forEach(p=>{
    const lv=String(p.powerbi_level||'').trim().toUpperCase();if(source[lv]!==undefined)source[lv]++;
    const tier=ctRelTierFromProduction(p);if(tier&&rel[tier]!==undefined)rel[tier]++;
   });
   for(const key of ['A','B','C'])if(!acknowledged&&(!Number.isInteger(Number(metadata[key]))||source[key]!==Number(metadata[key])))throw new Error('Power BI '+key+' tier mismatch');
   const managed=current.filter(p=>p.do_not_contact!==true&&String(p.relationship_status||'active').toLowerCase()!=='inactive');
   const data={active_partner_rows:current.length,managed_active_rows:managed.length,levels:rel,source_levels:source,stamp:receipt.imported_at,imported_at:receipt.imported_at,source:'verified shared Power BI server',verified:true};
   CT_LIVE_PB_CACHE.data=data;CT_LIVE_PB_CACHE.at=Date.now();ctPowerBiWarning(null);return data;
  }catch(error){CT_LIVE_PB_CACHE.data=null;CT_LIVE_PB_CACHE.at=0;ctPowerBiWarning(error.message||'Unknown error');throw error;}
 })().finally(function(){CT_LIVE_PB_CACHE.promise=null;});
 return CT_LIVE_PB_CACHE.promise;
}
window.ctGetLivePowerBiSummary=ctGetLivePowerBiSummary;
window.ctInvalidateLivePowerBi=function(){CT_LIVE_PB_CACHE.at=0;CT_LIVE_PB_CACHE.data=null;};
function ctGetPbAgentSnapshot(name){
  var snap=ctGetCurrentPowerBiSnapshot();
  if(!snap||!snap.by_agent)return null;
  var raw=(name||"").trim().toLowerCase();
  if(snap.by_agent[raw])return snap.by_agent[raw];
  var wanted=typeof ctAgentNameKey==="function"?ctAgentNameKey(name):raw.replace(/\s+/g," ");
  var keys=Object.keys(snap.by_agent);
  for(var i=0;i<keys.length;i++){
    var row=snap.by_agent[keys[i]]||{};
    var k=typeof ctAgentNameKey==="function"?ctAgentNameKey(row.name||keys[i]):String(row.name||keys[i]).trim().toLowerCase().replace(/\s+/g," ");
    if(k===wanted)return row;
  }
  return null;
}

function renderCallCard(a,lp,isBonus){
  var name=a[0],called=calledThisWeek(name),ds=effectiveDays(a),act=mostRecent(a),pri=isPriority(a),teamHold=lpRmCoordinationHold(a);
  var isCarryover=(typeof lastWeekLogs!=="undefined")&&getLpMissedLastWeek(a[2]).some(function(x){return x[0]===name;});
  var isPending=!!(pendingNote&&pendingNote[name]);
  var log=callLogs[name],note=log?log.note:"",outcome=log?log.outcome||"":"";
  var safeId=name.replace(/\s+/g,'_');
  var velData=getVelocifyForAgent(name)||{};
  var velTotal=Number(velData.total||0),velMtd=Number(velData.mtd||0),velLastDate=velData.last_lead_date||null;
  var lastNote=prevNotes[name]||null;
  var rmAct=rmActivity[name]||rmActivity[(name||"").toUpperCase()]||null;
  var firstCall=agentFirstCall[name]||null;
  var assignedLp=a[2]&&a[2]!=="Unassigned"?a[2]:null;
  var overdueDays=daysOverdue(a),tw=tierWindow(a);
  var pbInfo=ctGetPbAgentSnapshot(name)||{};
  var preq=Number(pbInfo.active_prequals||0),pipe=Number(pbInfo.active_pipeline||0);

  var dsText="",dueLabel="";
  if(ds===null){dsText="Never contacted";dueLabel="Call due";}
  else if(ds===0){dsText="Contacted today";}
  else if(!calledThisWeek(name)&&!isBonus){
    if(overdueDays>=0){dsText=overdueDays+"d overdue";dueLabel="Every "+tw+"d";}
    else{dsText="Due in "+Math.abs(overdueDays)+"d";dueLabel="Every "+tw+"d";}
  }else{dsText=ds+"d since touch";}

  var focus="";
  if(velMtd>0)focus="Thank them for "+velMtd+" lead"+(velMtd===1?"":"s")+" this month and ask what the buyer needs next.";
  else if(preq>0||pipe>0)focus="Ask about the active pipeline — "+preq+" prequal"+(preq===1?"":"s")+" and "+pipe+" in process.";
  else if(velTotal>0)focus="They have sent business before but none this month — ask what buyers are active right now.";
  else if(a[1]==="A"||a[1]==="Channel")focus="Protect the relationship — ask about pipeline, listings, and where the team can make things easier.";
  else if(a[1]==="B")focus="Growth call — ask what would make them more comfortable sending the next buyer.";
  else focus="Relationship call — ask what they are working on and offer one useful financing strategy.";

  var cardClass="call-card"+(pri&&!isBonus?" priority":"")+(called?" done":"")+(isBonus?" bonus":"")+(isPending?" pending":"");
  var html='<div class="'+cardClass+'">';
  var chkY='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#15803d" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  var chkPending='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00A8D4" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  var chkN='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.06 1.18 2 2 0 012 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14.92z"></path></svg>';
  html+='<button class="check-btn'+(called?' checked':'')+'" data-name="'+name+'" data-lp="'+lp+'" onclick="toggleCallFromCard(this)"'+(isPending?' style="border-color:#00A8D4;background:#F1F6F8"':'')+'>'+(called?chkY:(isPending?chkPending:chkN))+'</button>';
  html+='<div class="call-info">';

  html+='<div class="call-name">'+(called?'<span style="text-decoration:line-through;color:var(--text-3)">'+displayName(name)+'</span>':displayName(name));
  if(pri&&!called&&!isBonus)html+='<span class="priority-tag">PRIORITY</span>';
  if(isCarryover&&!called&&!isBonus)html+='<span class="carryover-tag">Missed last week</span>';
  html+='</div>';

  html+='<div class="call-meta"><span class="badge badge-'+String(a[1]||'C').toLowerCase()+'">'+(a[1]||'C')+'</span>';
  if(assignedLp&&assignedLp!==lp)html+='<span class="lp-tag lp-tag-'+assignedLp+'" style="font-size:10px">'+assignedLp+"'s agent</span>";
  var dsCls=(!called&&overdueDays>=0&&ds!==null&&ds!==0)?'color:var(--red);font-weight:650':(ds===null?'color:var(--red)':'color:var(--text-2)');
  html+='<span style="'+dsCls+'">'+dsText+'</span>';
  if(dueLabel)html+='<span style="font-size:10.5px;color:var(--text-3)">'+dueLabel+'</span>';
  if(act)html+='<span style="color:var(--text-3)">Last activity '+fmt(act)+'</span>';
  html+='</div>';

  if(teamHold&&!called)html+='<div style="margin-top:7px;padding:7px 9px;border:1px solid #C9D8E2;background:#F4F8FA;border-radius:7px;font-size:10.8px;color:#365365"><strong>Team coordination:</strong> '+escHtml(teamHold.message)+'</div>';
  if(!called&&!teamHold)html+='<div class="ct-focus-line"><strong>Focus:</strong> '+escHtml(focus)+'</div>';

  var chips=[];
  if(velMtd>0)chips.push('<span class="ct-business-chip hot">'+velMtd+' lead'+(velMtd===1?'':'s')+' MTD</span>');
  else if(velTotal>0)chips.push('<span class="ct-business-chip">'+velTotal+' lead'+(velTotal===1?'':'s')+' total</span>');
  if(preq>0)chips.push('<span class="ct-business-chip hot">'+preq+' active prequal'+(preq===1?'':'s')+'</span>');
  if(pipe>0)chips.push('<span class="ct-business-chip hot">'+pipe+' in pipeline</span>');
  if(chips.length)html+='<div class="ct-business-chips">'+chips.join('')+'</div>';

  html+='<div class="ct-contact-bar">';
  html+='<span style="font-size:12px;color:var(--text-2)" data-contact-phone="'+safeId+'">📞 <span style="color:var(--text-3)">Loading...</span></span>';
  html+='<span style="font-size:12px;color:var(--text-2)" data-contact-email="'+safeId+'">✉️ <span style="color:var(--text-3)">Loading...</span></span>';
  html+='<button class="btn btn-sm" onclick="openLpContactModal(\''+name.replace(/'/g,"\\'")+'\')" style="margin-left:auto;font-size:10.5px;padding:4px 8px">Edit</button>';
  html+='</div>';

  var context=[];
  if(velLastDate)context.push('<strong>Last lead:</strong> '+fmt(velLastDate));
  if(lastNote&&lastNote.note)context.push('<strong>Last team note:</strong> '+escHtml(lastNote.note));
  if(rmAct)context.push('<strong>RM touch:</strong> '+fmt(rmAct));
  if(firstCall){var tenure=Math.max(0,Math.floor((TODAY-new Date(firstCall+'T12:00:00'))/86400000));context.push('<strong>Relationship:</strong> '+(tenure>=365?Math.floor(tenure/365)+'y':tenure>=30?Math.floor(tenure/30)+'mo':tenure+'d'));}
  if(coMarketingIsActive(name))context.push('<strong>Co-marketing:</strong> active');
  if(context.length)html+='<details class="ct-context-details"><summary>More context ▾</summary><div class="ct-context-body">'+context.map(function(x){return '<div>'+x+'</div>';}).join('')+'</div></details>';

  if(called){
    html+='<div class="ct-done-summary"><strong>Logged:</strong> '+escHtml(outcome||'Completed')+(note?' · '+escHtml(note):'')+'</div>';
  }

  if(isPending){
    var pending=pendingNote[name]||{};
    var displayOutcome=pending.outcome||'';
    var curFlag=pending.flagRm||false;
    var outcomes=["Answered","VM + Text","In Person"];
    var labels=["Talked","VM + text","In person"];
    var cls=["sel-answered","sel-voicemail","sel-noanswer"];
    html+='<div class="ct-log-box"><div class="ct-log-title">Log outreach</div><div class="outcome-row">';
    for(var oi=0;oi<outcomes.length;oi++)html+='<button class="outcome-btn'+(displayOutcome===outcomes[oi]?' '+cls[oi]:'')+'" data-name="'+name+'" data-lp="'+lp+'" data-outcome="'+outcomes[oi]+'" onclick="selectPendingOutcome(this)">'+labels[oi]+'</button>';
    html+='</div>';
    html+='<textarea class="note-field ct-simple-note" data-name="'+name+'" data-lp="'+lp+'" placeholder="Quick note: buyer, listing, response, or next step" oninput="queueNote(this)">'+escHtml(pending.draft||'')+'</textarea>';
    var rlKey=name.toUpperCase(),rlData=receivedLeadsData[rlKey]||receivedLeadsData[ctAgentNameKey(name).toUpperCase()]||null;
    html+='<div class="ct-inline-actions">';
    html+='<button type="button" class="rm-flag-btn'+(curFlag?' is-flagged':'')+'" data-name="'+name+'" data-lp="'+lp+'" onclick="togglePendingRmFlag(this)"><span class="rm-flag-icon">'+(curFlag?'🚩':'🏳️')+'</span><span>'+(curFlag?'RM flagged':'Needs RM')+'</span></button>';
    html+='<button class="received-lead-btn'+(rlData?' is-received':'')+'" data-name="'+name+'" data-lp="'+lp+'" onclick="logReceivedLead(this.getAttribute(\'data-name\'),this.getAttribute(\'data-lp\'),this)"><span>🎯</span><span>'+(rlData?'Lead received ✓':'Lead received?')+'</span></button>';
    html+='</div>';
    html+='<button class="btn btn-primary btn-sm" style="margin-top:8px;width:100%;padding:9px" onclick="tryConfirmCall(\''+name.replace(/'/g,"\\'")+'\',\''+lp+'\')">Save outreach ✓</button>';
    html+='</div>';
  }

  html+='</div></div>';
  return html;
}

function escHtml(s){if(!s)return"";return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function pfrProperCase(s){return displayName(s||"");}

function selectOutcome(btn){
  var name=btn.getAttribute("data-name"),lp=btn.getAttribute("data-lp"),outc=btn.getAttribute("data-outcome");
  var log=callLogs[name];var cur=log?log.outcome||"":"";var newOutc=cur===outc?"":outc;
  if(callLogs[name])callLogs[name].outcome=newOutc;
  var clsMap2={"Answered":"sel-answered","Left VM":"sel-voicemail","VM + Text":"sel-voicemail","Sent Follow-up Text":"sel-text","Text Conversation":"sel-text","In Person":"sel-noanswer"};
  var card2=btn.closest(".call-card");
  if(card2)card2.querySelectorAll(".outcome-btn").forEach(function(ob){ob.className="outcome-btn"+(ob.getAttribute("data-outcome")===newOutc&&newOutc?" "+(clsMap2[newOutc]||""):"");});
  upsertCallLogWithOutcome(name,lp,callLogs[name]?callLogs[name].note||"":"",newOutc).catch(function(){});
}

var agentHistoryCache={};

function loadAgentHistory(name,containerId){
  if(agentHistoryCache[name]){renderAgentHistory(name,containerId,agentHistoryCache[name]);return;}
  sbFetch("GET","call_logs_history?agent_name=eq."+encodeURIComponent(name)+"&select=call_date,note,lp&order=call_date.desc&limit=20").then(function(res){
    agentHistoryCache[name]=res||[];
    renderAgentHistory(name,containerId,agentHistoryCache[name]);
  }).catch(function(){agentHistoryCache[name]=[];renderAgentHistory(name,containerId,[]);});
}

function renderAgentHistory(name,containerId,records){
  var el=document.getElementById(containerId);
  if(!el)return;
  if(!records||!records.length){el.innerHTML='<div style="font-size:11px;color:var(--text-3);padding:4px 0">No call history yet.</div>';return;}
  var h='';
  records.forEach(function(r){
    var d=r.call_date?fmt(r.call_date):"--";
    var note=(r.note||"").trim();
    var lp=r.lp||"";
    h+='<div style="padding:6px 0;border-bottom:1px solid var(--border-light);display:flex;gap:10px;align-items:flex-start">';
    h+='<div style="min-width:65px;font-size:11px;font-weight:600;color:var(--text-2);flex-shrink:0">'+d+'</div>';
    h+='<div style="flex:1">';
    if(lp)h+='<span class="lp-tag lp-tag-'+lp+'" style="font-size:10px;margin-bottom:2px;display:inline-block">'+lp+'</span>';
    if(note)h+='<div style="font-size:11px;color:var(--text-2);margin-top:2px;font-style:italic">"'+escHtml(note.length>100?note.substring(0,100)+"...":note)+'"</div>';
    else h+='<div style="font-size:11px;color:var(--text-3);font-style:italic">No note</div>';
    h+='</div></div>';
  });
  el.innerHTML=h;
}

function renderLpSearch(){
  var q=document.getElementById("lp-search-input").value.trim().toLowerCase();
  var el=document.getElementById("lp-search-results");
  var results;
  if(!q){
    var allActive=agents.filter(function(a){return isActive(a);}).slice();
    allActive.sort(function(a,b){return daysOverdue(b)-daysOverdue(a);});
    results=allActive.slice(0,20);
  } else {
    results=agents.filter(function(a){return a[0].toLowerCase().indexOf(q)>=0;}).slice(0,8);
  }
  if(!results.length){el.innerHTML='<div style="font-size:12px;color:#aaa;padding:8px 0">No agents found.</div>';return;}
  var h="";
  results.forEach(function(a){
    var called=calledThisWeek(a[0]);
    var log=callLogs[a[0]],note=log?log.note:"";
    var ds=effectiveDays(a);
    var overdueDays=daysOverdue(a);
    var tw=tierWindow(a);
    var dsText="";
    if(ds===null){dsText="Never contacted";}
    else if(ds===0){dsText="Contacted today";}
    else if(!calledThisWeek(a[0])){dsText=overdueDays>=0?(overdueDays+"d overdue"):("Due in "+Math.abs(overdueDays)+"d");}
    else{dsText=ds+"d since last touch";}
    var assignedLp=a[2]&&a[2]!=="Unassigned"?a[2]:"Unassigned";
    var histId="hist-"+a[0].replace(/\s+/g,"_").replace(/[^a-zA-Z0-9_]/g,"");
    var safeId=a[0].replace(/\s+/g,"_");
    var isPending=!!(pendingNote[a[0]]);
    var pending=isPending?(pendingNote[a[0]]||{}):{};
    var cardBorder=isPending?"border:1px solid #C8B8A8;background:#fffdf0":"border:1px solid var(--border);background:var(--surface)";

    h+='<div style="'+cardBorder+';border-radius:10px;padding:12px 14px;margin-bottom:8px">';
    h+='<div style="display:flex;align-items:flex-start;gap:12px">';

    // Check button
    var chkY='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#15803d" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    var chkPending='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    var chkN='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.06 1.18 2 2 0 012 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14.92z"></path></svg>';
    var chkIcon=called?chkY:(isPending?chkPending:chkN);
    var chkClass="check-btn"+(called?" checked":"");
    var chkStyle=isPending?"border-color:#d97706;background:#FAF7F2":"";
    h+='<button class="'+chkClass+'" style="width:36px;height:36px;flex-shrink:0;margin-top:2px;'+chkStyle+'" data-name="'+a[0]+'" data-lp="'+currentUser+'" onclick="toggleCallFromCard(this)">'+chkIcon+'</button>';

    h+='<div style="flex:1;min-width:0">';
    h+='<div style="font-weight:700;font-size:14px;margin-bottom:4px">'+(called?'<span style="text-decoration:line-through;color:var(--text-3)">'+displayName(a[0])+'</span>':displayName(a[0]))+'</div>';
    h+='<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px">';
    h+='<span class="badge badge-'+a[1].toLowerCase()+'">'+a[1]+'</span>';
    h+='<span class="lp-tag lp-tag-'+assignedLp+'">LP: '+assignedLp+'</span>';
    var rmOwner=getRmOwner(a[0])||"Unassigned";
    h+='<span style="font-size:10.5px;font-weight:600;color:#071B37;background:#EAF7FB;border:1px solid #CDEAF2;border-radius:999px;padding:2px 7px">RM: '+escHtml(rmOwner)+'</span>';
    h+='<span style="font-size:11px;color:'+(ds===null||overdueDays>=0?'var(--red)':'var(--text-2)')+'">'+dsText+'</span>';
    if(!isActive(a))h+='<span class="badge badge-inactive">Inactive</span>';
    h+='</div>';
    if(called&&note)h+='<div style="background:#faf9ff;border-left:3px solid #a78bfa;border-radius:0 6px 6px 0;padding:5px 9px;font-size:11px;color:var(--text-2);font-style:italic;margin-bottom:6px">"'+escHtml(note)+'"</div>';

    // Contact info row
    h+='<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px">';
    h+='<span data-contact-phone="'+safeId+'" style="font-size:12px;color:var(--text-2)">&#128222; <span style="color:var(--text-3)">Loading...</span></span>';
    h+='<span data-contact-email="'+safeId+'" style="font-size:12px;color:var(--text-2)">&#9993; <span style="color:var(--text-3)">Loading...</span></span>';
    h+='</div>';
    h+='</div>';

    h+='<button class="btn btn-sm" data-agent-name="'+escHtml(a[0])+'" onclick="var n=this.getAttribute(\'data-agent-name\');openLpContactModal(n)" style="font-size:11px;flex-shrink:0">Edit</button>';
    h+='</div>';

    // Pending note / outcome UI — shown when checkmark is tapped
    if(isPending){
      var curOutcome=pending.outcome||"";
      var curDraft=pending.draft||"";
      var hasDraft=!!curDraft.trim();
      var outcomes=["Answered","VM + Text","In Person"];
      var oLabels=["Talked","VM + text","In person"];
      var oCls=["sel-answered","sel-voicemail","sel-noanswer"];
      h+='<div style="margin-top:10px;border-top:1px solid var(--border-light);padding-top:10px">';
      h+='<div style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">What happened?</div>';
      h+='<div class="outcome-row">';
      for(var oi=0;oi<outcomes.length;oi++){
        h+='<button class="outcome-btn'+(curOutcome===outcomes[oi]?" "+oCls[oi]:"")+'" data-name="'+a[0]+'" data-lp="'+currentUser+'" data-outcome="'+outcomes[oi]+'" onclick="selectPendingOutcome(this)">'+oLabels[oi]+'</button>';
      }
      h+='</div>';
      h+='<div style="margin-top:8px">';
      h+='<div style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Quick note</div>';
      h+='<textarea class="note-field" data-name="'+a[0]+'" data-lp="'+currentUser+'" placeholder="What happened? Buyer, listing, response, or next step?" oninput="queueNote(this)" style="border-color:'+(hasDraft?'var(--green)':'var(--border)')+'">'+escHtml(curDraft)+'</textarea>';
      h+='</div>';
      h+='<button class="btn btn-primary btn-sm" data-name="'+a[0]+'" data-lp="'+currentUser+'" onclick="tryConfirmCall(this.getAttribute(\'data-name\'),this.getAttribute(\'data-lp\'))" style="margin-top:8px;width:100%;padding:9px">Save &amp; mark called &#10003;</button>';
      h+='</div>';
    }

    // Call history stays available, but collapsed so Search does not turn into a wall of data.
    h+='<details style="margin-top:8px;border-top:1px solid var(--border-light);padding-top:7px">';
    h+='<summary style="cursor:pointer;font-size:10.5px;font-weight:700;color:var(--text-3);list-style:none">Call history ▾</summary>';
    h+='<div id="'+histId+'" style="margin-top:6px"><div style="font-size:11px;color:var(--text-3)">Loading...</div></div>';
    h+='</details>';
    h+='</div>';
  });
  el.innerHTML=h;
  results.forEach(function(a){
    var histId="hist-"+a[0].replace(/\s+/g,"_").replace(/[^a-zA-Z0-9_]/g,"");
    loadAgentHistory(a[0],histId);
    loadAgentContact(a[0],a[0].replace(/\s+/g,"_"));
  });
}


function toggleCallFromCard(btn){
  var name=btn.getAttribute("data-name"),lp=btn.getAttribute("data-lp")||currentUser;
  var srEl=document.getElementById("lp-search-results");
  var inSearch=!!(srEl&&srEl.innerHTML.length>10);
  if(calledThisWeek(name)){
    // Uncheck — ask to confirm, then open pending note flow instead of just deleting
    // This lets LP update their note before re-saving rather than losing the entry
    if(!confirm("Remove this logged call for "+name+" so you can update the note?"))return;
    delete pendingNote[name];
    deleteCallLog(name).then(function(){
      // Immediately re-open pending flow so LP can re-log with correct note
      pendingNote[name]={draft:"",outcome:""};
      if(inSearch){
        renderLpSearch();
        setTimeout(function(){
          var ta=document.querySelector('#lp-search-results .note-field[data-name="'+name+'"]');
          if(ta){ta.scrollIntoView({behavior:"smooth",block:"center"});ta.focus();}
        },120);
      } else {
        renderLP(currentUser);
        setTimeout(function(){
          var ta=document.querySelector('.note-field[data-name="'+name+'"]');
          if(ta){ta.focus();}
        },100);
      }
    });
  } else {
    pendingNote[name]={draft:"",outcome:""};
    if(inSearch){
      renderLpSearch();
      setTimeout(function(){
        var ta=document.querySelector('#lp-search-results .note-field[data-name="'+name+'"]');
        if(ta){ta.scrollIntoView({behavior:"smooth",block:"center"});ta.focus();}
      },120);
    } else {
      renderLP(currentUser);
      setTimeout(function(){
        var ta=document.querySelector('.note-field[data-name="'+name+'"]');
        if(ta)ta.focus();
      },100);
    }
  }
}

function selectPendingOutcome(btn){
  var name=btn.getAttribute("data-name"),outc=btn.getAttribute("data-outcome");
  if(!pendingNote[name])pendingNote[name]={draft:"",outcome:""};
  var newOutc=pendingNote[name].outcome===outc?"":outc;
  pendingNote[name].outcome=newOutc;
  var clsMap={"Answered":"sel-answered","Left VM":"sel-voicemail","VM + Text":"sel-voicemail","Sent Follow-up Text":"sel-text","Text Conversation":"sel-text","In Person":"sel-noanswer"};
  var card=btn.closest(".call-card")||btn.parentNode;
  while(card&&!card.querySelector&&card.parentNode)card=card.parentNode;
  if(card&&card.querySelectorAll)card.querySelectorAll(".outcome-btn").forEach(function(ob){ob.className="outcome-btn"+(ob.getAttribute("data-outcome")===newOutc&&newOutc?" "+(clsMap[newOutc]||""):"");});
}

function tryConfirmCall(name,lp){
  var pending=pendingNote[name]||{};
  var draft=pending.draft||"";
  var outcome=pending.outcome||"";
  var flagRm=pending.flagRm||false;
  if(!outcome){
    // Show inline error on the save button
    var saveBtn=document.querySelector('.btn-primary[onclick*="tryConfirmCall"][onclick*="'+name.replace(/'/g,"\\'")+'"]');
    if(saveBtn){var ob=saveBtn.innerHTML;saveBtn.innerHTML="⚠ Select outcome first";saveBtn.style.background="#dc2626";setTimeout(function(){saveBtn.innerHTML=ob;saveBtn.style.background="";},2000);}
    return;
  }
  if(outcome==="Left VM"){
    var vmBtn=document.querySelector('.btn-primary[onclick*="tryConfirmCall"][onclick*="'+name.replace(/'/g,"\'")+'"]');
    if(vmBtn){var oldVm=vmBtn.innerHTML;vmBtn.innerHTML="⚠ Send the follow-up text too";vmBtn.style.background="#B8842B";setTimeout(function(){vmBtn.innerHTML=oldVm;vmBtn.style.background="";},2800);}
    return;
  }
  if(!draft.trim()){
    var saveBtn2=document.querySelector('.btn-primary[onclick*="tryConfirmCall"][onclick*="'+name.replace(/'/g,"\'")+'"]');
    if(saveBtn2){var ob2=saveBtn2.innerHTML;saveBtn2.innerHTML="⚠ Add a quick note first";saveBtn2.style.background="#dc2626";setTimeout(function(){saveBtn2.innerHTML=ob2;saveBtn2.style.background="";},2200);}
    return;
  }
  delete pendingNote[name];
  var srEl2=document.getElementById("lp-search-results");
  var searchWasActive=srEl2&&srEl2.innerHTML.length>10;
  var _saveSY=window.scrollY;
  upsertCallLogWithOutcome(name,lp,draft.trim(),outcome,flagRm).then(function(){
    if(searchWasActive){renderLpSearch();}
    else{renderLP(currentUser);setTimeout(function(){window.scrollTo(0,_saveSY);},50);}
  });
}

function queueNote(ta){
  var name=ta.getAttribute("data-name"),lp=ta.getAttribute("data-lp")||currentUser,val=ta.value;
  var hasText=!!val.trim();
  if(pendingNote[name]){
    pendingNote[name].draft=val;
    ta.style.borderColor=hasText?"var(--green)":"var(--border)";
    var card=ta.closest(".call-card");
    if(card){
      var hint=card.querySelector(".note-word-hint");
      if(hint)hint.textContent=hasText?"Note ready":"Add a quick useful note";
    }
  } else {
    ta.style.borderColor=hasText?"var(--green)":"var(--border)";
    if(noteTimers[name])clearTimeout(noteTimers[name]);
    noteTimers[name]=setTimeout(function(){
      var _sy=window.scrollY;
      upsertCallLog(name,lp,val);
      requestAnimationFrame(function(){window.scrollTo(0,_sy);});
    },800);
  }
}



function loadAgentContact(name,safeId){
  if(contactCache[name]){renderInlineContact(name,safeId,contactCache[name]);return;}
  sbFetch("GET","agent_profiles?agent_name=ilike."+encodeURIComponent(name)+"&limit=1").then(function(res){
    var data=(res&&res.length)?res[0]:{agent_name:name};
    contactCache[name]=data;renderInlineContact(name,safeId,data);
  }).catch(function(){contactCache[name]={agent_name:name};renderInlineContact(name,safeId,contactCache[name]);});
}

function copyContact(btn){
  var text=btn.getAttribute("data-copy");
  if(!text)return;
  navigator.clipboard.writeText(text).then(function(){
    var orig=btn.textContent;
    btn.textContent="Copied!";
    btn.style.color="#15803d";btn.style.borderColor="#86efac";
    setTimeout(function(){btn.textContent=orig;btn.style.color="";btn.style.borderColor="";},1500);
  }).catch(function(){});
}

function renderInlineContact(name,safeId,data){
  var ps=document.querySelectorAll('[data-contact-phone="'+safeId+'"]'),es=document.querySelectorAll('[data-contact-email="'+safeId+'"]');
  var p=ps.length?ps[0]:null,e=es.length?es[0]:null;
  var isMobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if(p){
    if(data.phone){
      var ph=escHtml(data.phone);
      if(isMobile){
        p.innerHTML='📞 <a href="tel:'+ph+'" style="font-weight:600;color:#1d4ed8;text-decoration:none">'+ph+'</a>';
      } else {
        p.innerHTML='📞 <span style="font-weight:600;color:var(--text)">'+ph+'</span>'
          +' <button data-copy="'+ph+'" onclick="copyContact(this)" style="margin-left:6px;font-size:10px;background:none;border:1px solid #bfdbfe;border-radius:4px;padding:2px 7px;color:#1d4ed8;cursor:pointer;font-family:inherit">Copy</button>';
      }
    } else {
      p.innerHTML='📞 <span style="color:#ccc">No phone</span>';
    }
  }
  if(e){
    if(data.email){
      var em=escHtml(data.email);
      if(isMobile){
        e.innerHTML='✉️ <a href="mailto:'+em+'" style="font-weight:500;color:#1d4ed8;text-decoration:none">'+em+'</a>';
      } else {
        e.innerHTML='✉️ <span style="font-weight:500;color:var(--text)">'+em+'</span>'
          +' <button data-copy="'+em+'" onclick="copyContact(this)" style="margin-left:6px;font-size:10px;background:none;border:1px solid #bfdbfe;border-radius:4px;padding:2px 7px;color:#1d4ed8;cursor:pointer;font-family:inherit">Copy</button>';
      }
    } else {
      e.innerHTML='✉️ <span style="color:#ccc">No email</span>';
    }
  }
  if(p)ps.forEach(function(x){if(x!==p)x.innerHTML=p.innerHTML;});
  if(e)es.forEach(function(x){if(x!==e)x.innerHTML=e.innerHTML;});
}

function openLpContactModal(name){
  editingLpContact=name;
  document.getElementById("lpContactModalName").textContent=displayName(name);
  var cp=contactCache[name]||{};
  document.getElementById("lp-cm-display-name").value=cp.display_name||ctDisplayNames[(name||"").trim().toLowerCase()]||"";
  document.getElementById("lp-cm-phone").value=cp.phone||"";
  document.getElementById("lp-cm-email").value=cp.email||"";
  ctSetBirthdayDropdowns(cp.birthday||"");
  var rmSel=document.getElementById("lp-cm-rm-owner"),lpSel=document.getElementById("lp-cm-lp-owner");
  if(rmSel)rmSel.value=getRmOwner(name)||"";
  var ag=agents.find(function(a){return assignmentKey(a[0])===assignmentKey(name);});
  if(lpSel)lpSel.value=(ag&&ag[2])||"Unassigned";
  sbFetch("GET","agent_assignments?agent_name=ilike."+encodeURIComponent(name)+"&select=*&limit=5").then(function(rows){
    var ar=(rows||[]).find(function(r){return assignmentKey(r.agent_name)===assignmentKey(name);})||(rows||[])[0];
    if(ar){agentRmOwners[assignmentKey(ar.agent_name)]=ar.rm||"";if(rmSel)rmSel.value=ar.rm||"";if(lpSel)lpSel.value=(ar.lp&&ar.lp!=="__REMOVED__")?ar.lp:"Unassigned";}
  }).catch(function(){});
  if(!contactCache[name]){
    sbFetch("GET","agent_profiles?agent_name=ilike."+encodeURIComponent(name)+"&limit=1").then(function(res){
      var data=(res&&res.length)?res[0]:{agent_name:name};
      contactCache[name]=data;
      document.getElementById("lp-cm-display-name").value=data.display_name||"";
      document.getElementById("lp-cm-phone").value=data.phone||"";
      document.getElementById("lp-cm-email").value=data.email||"";
      ctSetBirthdayDropdowns(data.birthday||"");
    }).catch(function(){});
  }
  document.getElementById("lpContactModal").classList.add("open");
}

window.openLpContactModal=openLpContactModal;
function closeLpContactModal(){document.getElementById("lpContactModal").classList.remove("open");editingLpContact=null;}
function openScriptsModal(){
  document.getElementById("scriptsModal").classList.add("open");
  var box=document.querySelector("#scriptsModal .contact-modal-box");
  if(box) box.scrollTop=0;
}
function closeScriptsModal(){document.getElementById("scriptsModal").classList.remove("open");}
function filterScripts(value){
  var q=(value||"").trim().toLowerCase();
  var cats=Array.from(document.querySelectorAll("#scriptsModal .script-cat"));
  var shown=0;
  cats.forEach(function(cat){
    var match=!q || (cat.textContent||"").toLowerCase().indexOf(q)!==-1;
    cat.style.display=match?"block":"none";
    if(match){
      shown++;
      if(q) cat.open=true;
    }
  });
  var empty=document.getElementById("scriptNoResults");
  if(empty) empty.style.display=(q && shown===0)?"block":"none";
}
function clearScriptSearch(){
  var input=document.getElementById("scriptSearchInput");
  if(input) input.value="";
  filterScripts("");
  var box=document.querySelector("#scriptsModal .contact-modal-box");
  if(box) box.scrollTop=0;
}

function saveLpContactModal(){
  if(!editingLpContact)return;
  var btn=document.querySelector("#lpContactModal .btn-primary");
  if(btn){if(btn.disabled)return;btn.disabled=true;btn.dataset.origText=btn.dataset.origText||btn.textContent;btn.textContent="Saving...";}
  var savedName=editingLpContact; // capture now — a fast second open/close shouldn't be able to change what this save targets
  var ownershipSaveOk=true;
  // agent_name is the real primary key here (confirmed against the live schema — agent_profiles
  // has no id column), and this app already keys everything off it with an exact eq. match, so
  // there's no ambiguity risk the way there was in the RM Tracker's case-insensitive lookup.
  var payload={agent_name:savedName,display_name:document.getElementById("lp-cm-display-name").value.trim()||null,phone:document.getElementById("lp-cm-phone").value.trim()||null,email:document.getElementById("lp-cm-email").value.trim()||null,birthday:ctGetBirthdayValue()};
  sbFetch("GET","agent_profiles?agent_name=ilike."+encodeURIComponent(savedName)+"&limit=5").then(function(res){
    var existing=(res||[]).find(function(r){return assignmentKey(r.agent_name)===assignmentKey(savedName);})||(res||[])[0];
    var method=existing?"PATCH":"POST";
    // Reuse the existing Power BI profile primary key despite capitalization differences.
    payload.agent_name=existing&&existing.agent_name||savedName;
    var path=method==="PATCH"?"agent_profiles?agent_name=eq."+encodeURIComponent(payload.agent_name):"agent_profiles";
    return lpProfileWrite(method,path,payload);
  }).then(function(){
    var rmVal=document.getElementById("lp-cm-rm-owner")?document.getElementById("lp-cm-rm-owner").value:"";
    var lpVal=document.getElementById("lp-cm-lp-owner")?document.getElementById("lp-cm-lp-owner").value:"Unassigned";
    return sbFetch("GET","agent_assignments?agent_name=ilike."+encodeURIComponent(savedName)+"&select=*&limit=5").catch(function(){return[];}).then(function(rows){
      var ar=(rows||[]).find(function(r){return assignmentKey(r.agent_name)===assignmentKey(savedName);})||(rows||[])[0]||{};
      var payloadA={agent_name:ar.agent_name||savedName,lp:lpVal||"Unassigned",rm:rmVal||null,priority:!!ar.priority,added:!!ar.added,level:ar.level||"C"};
      if(ar.closed_past_year!==undefined)payloadA.closed_past_year=ar.closed_past_year;
      return sbFetch("POST","agent_assignments?on_conflict=agent_name",payloadA).then(function(){
        agentRmOwners[assignmentKey(savedName)]=rmVal||"";
        var ag=agents.find(function(a){return assignmentKey(a[0])===assignmentKey(savedName);});if(ag)ag[2]=lpVal||"Unassigned";
      }).catch(function(err){
        ownershipSaveOk=false;
        console.warn("Ownership save failed:",err);
      });
    });
  }).then(function(){
    if(!contactCache[savedName])contactCache[savedName]={agent_name:savedName};
    Object.assign(contactCache[savedName],payload);
    if(payload.display_name)ctDisplayNames[(savedName||"").trim().toLowerCase()]=payload.display_name;
    else delete ctDisplayNames[(savedName||"").trim().toLowerCase()];
    setSyncStatus("live");
    // Refresh the view immediately so RM/LP ownership changes are visible without a page reload.
    try{
      if(currentUser&&LPS.indexOf(currentUser)>=0)renderLP(currentUser);
      if(document.getElementById("view-scorecards")&&document.getElementById("view-scorecards").classList.contains("active"))renderDaniel();
      if(document.getElementById("view-admin")&&document.getElementById("view-admin").classList.contains("active"))renderAdmin();
    }catch(refreshErr){console.warn("Ownership refresh failed:",refreshErr);}
    var st=document.getElementById("lpContactModalStatus");
    if(st){st.style.display="block";st.style.background=ownershipSaveOk?"#f0fdf4":"#fff7ed";st.style.color=ownershipSaveOk?"#15803d":"#9a3412";st.textContent=ownershipSaveOk?"Contact + ownership saved!":"Contact saved, but RM ownership needs the one-time Supabase ownership setup.";}
    setTimeout(function(){closeLpContactModal();if(st)st.style.display="none";},ownershipSaveOk?900:2600);
  }).catch(function(e){
    var st=document.getElementById("lpContactModalStatus");
    if(st){st.style.display="block";st.style.background="#fff1f2";st.style.color="#be123c";st.textContent="Save failed. Try again.";}
    else console.error("Save failed:",e);
  }).finally(function(){
    if(btn){btn.disabled=false;btn.textContent=btn.dataset.origText||"Save";}
  });
}

function renderLeaderboard(){
  var stats=LPS.map(function(lp){
    var allCalls=lpHistoryCallCounts&&lpHistoryCallCounts[lp];
    var done=getLpCallsThisWeek(lp),pct=getLpPctThisWeek(lp);
    return{lp:lp,allCalls:allCalls,done:done,pct:pct,streak:calcStreak(lp)};
  }).sort(function(a,b){return (b.allCalls||0)-(a.allCalls||0);});
  var medals=["🥇","🥈","🥉","4.","5."];
  document.getElementById("leaderboard").innerHTML=stats.map(function(s,i){
    return'<div class="leaderboard-row" data-team-lp="'+escHtml(s.lp)+'" role="button" tabindex="0" title="Open '+escHtml(s.lp)+' outreach detail"><span style="font-size:18px;width:28px;text-align:center">'+(medals[i]||(i+1)+'.')+'</span><div style="flex:1"><div style="font-weight:700;font-size:14px;color:'+LP_COLORS[s.lp]+'">'+escHtml(s.lp)+'</div><div style="font-size:11px;color:#888;margin-top:2px">'+(s.allCalls==null?'All-time count unavailable':s.allCalls+' outreach workflows recorded in history')+(s.streak>0?' &nbsp;🔥 '+s.streak+' week streak':'')+'</div></div><div style="text-align:right"><div style="font-size:18px;font-weight:800;color:'+(s.pct===100?"#43A047":s.pct>50?"#FB8C00":"#E53935")+'">'+s.pct+'%</div><div style="font-size:10px;color:#888">'+s.done+'/'+WEEKLY_TARGET+' completed this week</div></div></div>';
  }).join("");
}

function ctOpenLeaderboardLp(lp){
  if(LPS.indexOf(lp)<0||typeof window.pfrShowDetail!=='function')return;
  var records=Object.values(callLogs).filter(function(l){return l.lp===lp&&l.week_key===weekKey&&lpWorkflowCompleteLog(l);});
  var history=lpHistoryCallCounts&&lpHistoryCallCounts[lp];
  window.pfrShowDetail(lp+' · outreach detail',records.length+' / '+WEEKLY_TARGET+' completed this week. '+(history==null?'Historical total unavailable.':history+' outreach workflows recorded in call history; only current-week records are available here.'),records.map(function(r){return{name:r.agent_name||'Agent not recorded',detail:(r.call_date||'Date unavailable')+' · '+(r.outcome||'Outcome not recorded')};}));
}

// ── MANAGEMENT DASHBOARD ADDITIONS ──────────────────────────────────────

function renderAlerts(){
  var el=document.getElementById("d-alerts-section");
  if(!el)return;
  var alerts=[];

  // Priority agents not called this week
  LPS.forEach(function(lp){
    var uncalled=agents.filter(function(a){return a[2]===lp&&isPriority(a)&&isActive(a)&&!calledThisWeek(a[0]);});
    if(uncalled.length)alerts.push({level:"red",msg:"&#9888; "+lp+" has "+uncalled.length+" priority agent"+(uncalled.length>1?"s":"")+" not yet called this week"});
  });

  // LPs behind pace (less than 60% of week done but >40% of week elapsed)
  var now=new Date(),dayOfWeek=now.getDay();
  var weekDaysPassed=dayOfWeek===0?5:Math.min(dayOfWeek,5); // Mon=1..Fri=5
  var weekPctElapsed=weekDaysPassed/5;
  if(weekPctElapsed>0.4){
    LPS.forEach(function(lp){
      var pct=getLpPctThisWeek(lp)/100;
      if(pct<weekPctElapsed-0.2){
        alerts.push({level:"amber",msg:"&#128337; "+lp+" is behind pace — "+getLpPctThisWeek(lp)+"% done with ~"+Math.round(weekPctElapsed*100)+"% of the week gone"});
      }
    });
  }

  // Agents overdue across all LPs (A-tier >7d, B-tier >14d, C-tier >21d)
  var overdueCount=agents.filter(function(a){
    if(!isActive(a))return false;
    var ds=effectiveDays(a);
    if(ds===null)return false;
    var tw=tierWindow(a);
    return ds>tw;
  }).length;
  if(overdueCount>0)alerts.push({level:"amber",msg:"&#128197; "+overdueCount+" agent"+(overdueCount>1?"s are":" is")+" overdue for a call across all LPs"});

  if(!alerts.length){
    el.innerHTML='<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;font-size:12px;color:#15803d;font-weight:500;display:flex;align-items:center;gap:8px">&#10003; No alerts — all clear!</div>';
    return;
  }
  el.innerHTML=alerts.map(function(a){
    var bg=a.level==="red"?"#fff1f2":"#FAF7F2",border=a.level==="red"?"#fecdd3":"#E8DDD0",color=a.level==="red"?"#be123c":"#5C4A35";
    return'<div style="background:'+bg+';border:1px solid '+border+';border-radius:8px;padding:10px 14px;font-size:12px;color:'+color+';font-weight:500;margin-bottom:6px;display:flex;align-items:center;gap:8px">'+a.msg+'</div>';
  }).join("");
}

async function renderGrowthScoreboard(){
  var el=document.getElementById("d-growth-scoreboard");
  if(!el)return;
  var managedAgents=agents.filter(isActive),live=null;
  try{live=await ctGetLivePowerBiSummary(false);}catch(e){console.warn('Live Power BI summary unavailable',e)}
  var pbSnap=ctGetCurrentPowerBiSnapshot(),pbLevels=(pbSnap&&pbSnap.levels)||{},milestone=ctCurrentRelationshipMilestone();
  var total=live&&(live.verified||live.acknowledged_excluded_rows===5)?Number(live.active_partner_rows):null; // Never substitute managed or browser-roster counts for the official Power BI scorecard denominator.
  var channelTier=live?Number(live.levels.Channel||0):Number(pbLevels.Channel||0);
  var aTier=live?Number(live.levels.A||0):Number(pbLevels.A||0),bTier=live?Number(live.levels.B||0):Number(pbLevels.B||0),cTier=live?Number(live.levels.C||0):Number(pbLevels.C||0);
  if(!live&&!ctPowerBiActiveCount(pbSnap)){channelTier=managedAgents.filter(function(a){return a[1]==="Channel";}).length;aTier=managedAgents.filter(function(a){return a[1]==="A";}).length;bTier=managedAgents.filter(function(a){return a[1]==="B";}).length;cTier=managedAgents.filter(function(a){return a[1]==="C";}).length;}
  var GOAL_TOTAL=200,GOAL_CHANNEL=milestone.Channel,GOAL_A=milestone.A,GOAL_B=milestone.B;

  function bar(val,goal,color){
    if(val===null||!Number.isFinite(Number(val)))return '<div style="font-size:11px;color:#9a3412">Power BI verification required</div>';var pct=Math.min(val/goal,1);
    var labelColor=pct>=1?"#15803d":pct>=0.7?"#b8922a":"#64748b";
    return'<div style="height:6px;background:#f1f5f9;border-radius:3px;overflow:hidden;margin:5px 0 3px"><div style="height:100%;width:'+Math.round(pct*100)+'%;background:'+color+';border-radius:3px;transition:width .4s"></div></div>'
      +'<div style="font-size:10px;color:'+labelColor+'">'+val+' / '+goal+' goal &nbsp;('+Math.round(pct*100)+'%)</div>';
  }

  // LP breakdown
  var lpRows="";
  LPS.forEach(function(lp){
    var lpActive=agents.filter(function(a){return a[2]===lp&&isActive(a);});
    var lpA=lpActive.filter(function(a){return a[1]==="A";}).length;
    var lpB=lpActive.filter(function(a){return a[1]==="B";}).length;
    var lpC=lpActive.filter(function(a){return a[1]==="C";}).length;
    lpRows+='<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f0f2f8">'
      +'<span style="font-size:12px;font-weight:600;color:'+LP_COLORS[lp]+';width:52px">'+lp+'</span>'
      +'<span class="badge badge-a" style="font-size:10px">A:'+lpA+'</span>'
      +'<span class="badge badge-b" style="font-size:10px">B:'+lpB+'</span>'
      +'<span class="badge badge-c" style="font-size:10px">C:'+lpC+'</span>'
      +'<span style="margin-left:auto;font-size:12px;font-weight:600;color:#475569">'+lpActive.length+' active</span>'
      +'</div>';
  });

  el.innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px">'
    +'<div style="background:#f8fafc;border-radius:8px;padding:14px;border:1px solid var(--border)">'
      +'<div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Power BI Active Agents</div>'
      +'<div style="font-size:28px;font-weight:800;color:#0f172a;letter-spacing:-.02em">'+(total===null?'—':total)+'</div>'
      +bar(total,GOAL_TOTAL,"#1F4E79")
    +'</div>'
    +'<div style="background:#fff8e8;border-radius:8px;padding:14px;border:1px solid #ecd9a8">'
      +'<div style="font-size:11px;font-weight:700;color:#84651e;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Relationship Channel</div>'
      +'<div style="font-size:28px;font-weight:800;color:#84651e;letter-spacing:-.02em">'+channelTier+'</div>'
      +bar(channelTier,GOAL_CHANNEL,"#84651e")
    +'</div>'
    +'<div style="background:#f0fdf4;border-radius:8px;padding:14px;border:1px solid #bbf7d0">'
      +'<div style="font-size:11px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Relationship A</div>'
      +'<div style="font-size:28px;font-weight:800;color:#15803d;letter-spacing:-.02em">'+aTier+'</div>'
      +bar(aTier,GOAL_A,"#15803d")
    +'</div>'
    +'<div style="background:#eff6ff;border-radius:8px;padding:14px;border:1px solid #bfdbfe">'
      +'<div style="font-size:11px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Relationship B</div>'
      +'<div style="font-size:28px;font-weight:800;color:#1d4ed8;letter-spacing:-.02em">'+bTier+'</div>'
      +bar(bTier,GOAL_B,"#1d4ed8")
    +'</div>'
    +'<div style="background:#f8fafc;border-radius:8px;padding:14px;border:1px solid var(--border)">'
      +'<div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Relationship C</div>'
      +'<div style="font-size:28px;font-weight:800;color:#64748b;letter-spacing:-.02em">'+cTier+'</div>'
      +'<div style="font-size:10px;color:#94a3b8;margin-top:8px">Development pool</div>'
    +'</div>'
  +'</div>'
  +'<div style="font-size:10.5px;color:var(--text-3);margin:-6px 0 12px"><b>Live source:</b> '+(live&&live.stamp?new Date(live.stamp).toLocaleString():"No shared Power BI stamp")+' · Power BI Active Agents is the exact latest A/B/C source population. Relationship Channel/A/B/C is recalculated from production using the RM definition. Current milestone: '+milestone.label+'.</div>'
  +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;margin-bottom:8px">Managed roster by LP</div>'
  +lpRows;
}

async function renderRmSummary(){
  var el=document.getElementById("d-rm-summary");
  if(!el)return;
  try{
    var now=new Date(),todayStr=localDateStr(now);
    var week=rmWeekRange?rmWeekRange():{start:todayStr,end:todayStr};
    var res=await fetch(SB_URL+"/rest/v1/amanda_activities?act_date=gte."+week.start+"&act_date=lte."+week.end+"&select=act_type,act_date,agent_name,notes",
      {headers:{apikey:SB_KEY,Authorization:"Bearer "+SB_KEY}});
    var acts=await res.json();
    if(Array.isArray(acts))acts=acts.filter(function(a){return ctRmOwnerFromNotes(a.notes)==="Amanda";});
    if(!Array.isArray(acts)){el.innerHTML='<div style="font-size:12px;color:#aaa;text-align:center;padding:10px">Could not load Amanda data.</div>';return;}

    var flagRes=await fetch(SB_URL+"/rest/v1/call_logs?flag_rm=eq.true&select=id,agent_name,lp,call_date,note,outcome&order=call_date.desc",{headers:{apikey:SB_KEY,Authorization:"Bearer "+SB_KEY}});
    var flagRows=await flagRes.json();
    var flagList=Array.isArray(flagRows)?flagRows:[];
    var flagCount=flagList.length;

    var goals=[
      {type:"Cold Calls",label:"Cold calls",weekly:125},
      {type:"New Realtor Meeting",label:"New meetings",weekly:3},
      {type:"__existing__",label:"Existing partner meetings",weekly:5},
      {type:"__talkto__",label:"Talk-to's",weekly:100},
      {type:"Realtor Buddy Referral Ask",label:"Buddy referral asks",weekly:3}
    ];
    var cards=goals.map(function(g){
      var count=g.type==="__talkto__"?amCntTalkTo(acts)
        :g.type==="__existing__"?acts.filter(function(a){return ctIsExistingRmMeeting(a.act_type);}).length
        :acts.filter(function(a){return a.act_type===g.type;}).length;
      var pct=Math.min(count/g.weekly,1);
      var color=pct>=1?"#15803d":pct>=0.6?"#b8922a":"#9ca3af";
      return'<div style="text-align:center;background:#f8fafc;border-radius:8px;padding:12px;border:1px solid var(--border)">'
        +'<div style="font-size:20px;font-weight:700;color:'+color+'">'+count+'</div>'
        +'<div style="font-size:10px;color:#888;margin-top:2px">'+g.label+'</div>'
        +'<div style="font-size:10px;color:#aaa">/ '+g.weekly+' goal</div>'
        +'<div style="height:3px;background:#e2e8f0;border-radius:2px;margin-top:6px;overflow:hidden">'
        +'<div style="height:100%;width:'+Math.round(pct*100)+'%;background:'+color+'"></div></div>'
      +'</div>';
    }).join("");

    var flagDetail=flagList.length?flagList.map(function(r){
      var note=(r.note||"").trim();
      var shortNote=note.length>120?note.substring(0,120)+"...":note;
      return'<div style="padding:9px 0;border-bottom:1px solid #fde6cc;display:flex;justify-content:space-between;align-items:flex-start;gap:10px">'
        +'<div style="flex:1;min-width:0">'
        +'<div style="font-size:12px;font-weight:700;color:#7c2d12">'+escHtml(displayName(r.agent_name||""))+' <span style="font-size:10px;color:#c2853f;font-weight:500">via '+escHtml(r.lp||"LP")+'</span></div>'
        +(shortNote?'<div style="font-size:11px;color:#5C4A35;margin-top:2px;font-style:italic">&ldquo;'+escHtml(shortNote)+'&rdquo;</div>':'')
        +'<div style="font-size:10px;color:#c2853f;margin-top:2px">'+fmt(r.call_date)+(r.outcome?" &middot; "+escHtml(r.outcome):"")+'</div>'
        +'</div>'
        +'<button class="btn btn-sm" onclick="dResolveFlag(\''+String(r.id)+'\')" style="font-size:10px;flex-shrink:0">Mark handled</button>'
        +'</div>';
    }).join(""):'<div style="font-size:12px;color:#aaa;padding:8px 0">No flagged agents right now.</div>';

    el.innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-bottom:12px">'+cards+'</div>'
      +'<div style="display:flex;gap:12px;flex-wrap:wrap">'
      +'<div onclick="toggleDFlagged()" style="cursor:pointer;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px 16px;font-size:12px;color:#c2410c;display:flex;align-items:center;gap:6px;user-select:none">'
        +'<span style="font-weight:700;font-size:18px">'+flagCount+'</span> <span style="font-weight:500">flagged by LPs</span><span id="d-flag-chev" style="font-size:11px">&#9662;</span></div>'
      +'<div style="font-size:11px;color:#94a3b8;display:flex;align-items:center">'+acts.length+' total activities this week</div>'
      +'</div>'
      +'<div id="d-flagged-detail" style="display:none;margin-top:10px;background:#fffaf3;border:1px solid #fde6cc;border-radius:8px;padding:4px 14px">'+flagDetail+'</div>';
  }catch(e){el.innerHTML='<div style="font-size:12px;color:#aaa;text-align:center;padding:10px">Could not load Amanda data.</div>';}
}

function toggleDFlagged(){
  var box=document.getElementById("d-flagged-detail"),chev=document.getElementById("d-flag-chev");
  if(!box)return;
  var open=box.style.display!=="none";
  box.style.display=open?"none":"block";
  if(chev)chev.innerHTML=open?"&#9662;":"&#9652;";
}

function dResolveFlag(id){
  sbFetch("PATCH","call_logs?id=eq."+encodeURIComponent(id),{flag_rm:false}).then(function(){renderRmSummary();}).catch(function(){});
}

async function renderLpScorecardSummary(){
  var el=document.getElementById("d-lp-scorecard-summary");
  if(!el)return;
  try{
    var wk=getWeekKey(TODAY);
    var res=await fetch(
      SB_URL+"/rest/v1/lp_scorecards?person=in.("+LPSC_TEAM_LPS.join(",")+")"+"&week_key=eq."+wk+"&select=person,data",
      {headers:{apikey:SB_KEY,Authorization:"Bearer "+SB_KEY}}
    );
    var rows=await res.json();
    if(!Array.isArray(rows)||!rows.length){
      el.innerHTML='<div style="font-size:12px;color:#aaa;text-align:center;padding:10px">No scorecard data entered yet this week.</div>';
      return;
    }
    var metrics=LPSC_METRICS_MAP._lp2;
    var byPerson={};
    rows.forEach(function(r){byPerson[r.person]=r.data||{};});

    // Header
    var thead='<thead><tr><th style="background:#1F4E79;color:#fff;padding:8px 12px;text-align:left;font-size:11px;font-weight:600;white-space:nowrap">LP</th>';
    metrics.forEach(function(m){thead+='<th style="background:#1F4E79;color:#fff;padding:8px 10px;text-align:center;font-size:11px;font-weight:600">'+m.label+'</th>';});
    thead+='</tr></thead>';

    var tbody='<tbody>';
    LPSC_TEAM_LPS.filter(function(lp){return lp!=="Isaak";}).forEach(function(lp){
      var data=byPerson[lp]||{};
      tbody+='<tr><td style="padding:8px 12px;font-size:12px;font-weight:600;border-bottom:1px solid #f0f2f8;color:'+LP_COLORS[lp]+'">'+lp+'</td>';
      metrics.forEach(function(m){
        var t=lpscGetTotal(m.key,data);
        var pct=Math.min(t/m.goal,1);
        var color=pct>=1?"#15803d":pct>=0.6?"#b8922a":"#94a3b8";
        tbody+='<td style="padding:8px 10px;text-align:center;font-size:12px;font-weight:600;border-bottom:1px solid #f0f2f8;color:'+color+'">'+t+'<span style="font-size:10px;color:#cbd5e1;font-weight:400"> /'+m.goal+'</span></td>';
      });
      tbody+='</tr>';
    });
    tbody+='</tbody>';

    el.innerHTML='<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">'+thead+tbody+'</table></div>'
      +'<div style="font-size:10px;color:#aaa;margin-top:8px">LP2 comparison only. Track Isaak separately as LP1; include his app-support production in team totals.</div>';
  }catch(e){el.innerHTML='<div style="font-size:12px;color:#aaa;text-align:center;padding:10px">Could not load scorecard data.</div>';}
}

function getLpMissedLastWeek(lp){
  // Carryover focus is NOT reconstructed alphabetically. We take the number of missed
  // workflows from last week, then choose today's highest-priority / most-overdue active
  // relationships that had no completed outreach last week. Open RM handoffs are paused.
  var need=getLpIncompleteFromLastWeek(lp);
  if(need<=0)return[];
  var candidates=agents.filter(function(a){
    if(a[2]!==lp||!ctRosterEligible(a)||!isActive(a)||lpOpenRmFlags[assignmentKey(a[0])])return false;
    var log=lastWeekLogs[a[0]];
    return !(log&&log.week_key===lastWeekKey&&lpWorkflowCompleteLog(log));
  });
  candidates.sort(function(a,b){
    if(isPriority(a)!==isPriority(b))return isPriority(b)-isPriority(a);
    return daysOverdue(b)-daysOverdue(a);
  });
  return candidates.slice(0,need);
}

function toggleCarryoverList(lp){
  var el=document.getElementById("carryover-list-el");
  if(!el)return;
  if(el.style.display!=="none"){el.style.display="none";el.innerHTML="";return;}
  var missed=getLpMissedLastWeek(lp);
  var html='<div style="font-size:11px;font-weight:700;color:#8C7355;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Carryover focus · no completed outreach last week ('+missed.length+')</div>';
  if(!missed.length){
    html+='<div style="font-size:12px;color:#8C7355">Every agent in last week\'s rotation was called. The carryover number reflects rotation size vs. logged calls.</div>';
  } else {
    missed.forEach(function(a){
      var calledNow=calledThisWeek(a[0]);
      html+='<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #f4e3b8">';
      html+='<span style="font-weight:600;font-size:13px;flex:1'+(calledNow?';text-decoration:line-through;color:var(--text-3)':'')+'">'+escHtml(displayName(a[0]))+'</span>';
      html+='<span class="badge badge-'+a[1].toLowerCase()+'">'+a[1]+'</span>';
      if(calledNow){
        html+='<span style="font-size:11px;color:var(--green);font-weight:700">\u2713 Called this week</span>';
      } else {
        html+='<button class="btn btn-sm" data-name="'+escHtml(a[0])+'" data-lp="'+lp+'" onclick="carryoverQuickLog(this)" style="font-size:11px">Log call</button>';
      }
      html+='</div>';
    });
  }
  el.innerHTML=html;
  el.style.display="block";
}

function carryoverQuickLog(btn){
  var name=btn.getAttribute("data-name"),lp=btn.getAttribute("data-lp");
  // Open the same pending-note flow used by the main list, then scroll to the card
  pendingNote[name]={draft:"",outcome:""};
  renderLP(lp);
  setTimeout(function(){
    var ta=document.querySelector('.note-field[data-name="'+name+'"]');
    if(ta){ta.scrollIntoView({behavior:"smooth",block:"center"});ta.focus();}
    var listEl=document.getElementById("carryover-list-el");
    if(listEl)listEl.style.display="none";
  },150);
}

function renderCarryoverAlerts(){
  var el=document.getElementById("d-carryover-section");
  if(!el)return;
  var list=[];
  LPS.forEach(function(lp){
    var incomplete=getLpIncompleteFromLastWeek(lp);
    if(incomplete>0)list.push({lp:lp,incomplete:incomplete});
  });
  if(!list.length){el.innerHTML="";return;}
  var html='<div style="background:#FAF7F2;border:1px solid #E8DDD0;border-radius:8px;padding:14px;margin-bottom:1rem">'
    +'<div style="font-size:13px;font-weight:700;color:#5C4A35;margin-bottom:10px">&#9888;&#65039; Call carryover active — missed weekly outreach adds carryover focus this week</div>';
  list.forEach(function(a){
    html+='<div style="background:rgba(255,255,255,.6);border-radius:6px;padding:10px;margin-bottom:6px;border-left:3px solid #B5A090;cursor:pointer" onclick="goToLP(\''+lp+'\')">'
      +'<div style="display:flex;align-items:center;justify-content:space-between"><div style="font-size:12px;font-weight:700;color:'+(LP_COLORS[a.lp]||"#5C4A35")+'">'+a.lp+'</div><span style="font-size:10px;color:#8C7355">tap to open &#8599;</span></div>'
      +'<div style="font-size:12px;color:#5C4A35;margin-top:4px">Last week incomplete: <b>'+a.incomplete+' call'+(a.incomplete>1?"s":"")+'</b></div>'
      +'<div style="font-size:11px;color:#6B5740;margin-top:2px">This week target: '+WEEKLY_TARGET+' new + '+a.incomplete+' carryover = <b>'+(WEEKLY_TARGET+a.incomplete)+' total</b></div>'
      +'</div>';
  });
  html+='</div>';
  el.innerHTML=html;
}

function renderNoteQuality(){
  var el=document.getElementById("d-note-quality-section");
  if(!el)return;

  // No word-count policing. Only flag obvious copy/paste gaming or removal signals.
  function isLowQuality(note){
    if(!note||!note.trim())return false;
    // Strip punctuation and split
    var words=note.trim().toLowerCase().split(/\s+/).map(function(w){return w.replace(/[.,!?;:\-"'()]+/g,"");}).filter(function(w){return w.length>0;});
    // Exclude common stop words before checking quality
    var stopWords={"the":1,"to":1,"a":1,"an":1,"and":1,"or":1,"but":1,"in":1,"on":1,"at":1,
      "for":1,"of":1,"with":1,"that":1,"this":1,"is":1,"are":1,"was":1,"were":1,"be":1,
      "been":1,"have":1,"has":1,"had":1,"do":1,"does":1,"did":1,"will":1,"would":1,"could":1,
      "should":1,"may":1,"can":1,"not":1,"no":1,"it":1,"its":1,"they":1,"them":1,"their":1,
      "we":1,"he":1,"she":1,"his":1,"her":1,"i":1,"you":1,"so":1,"up":1,"out":1,"as":1,
      "by":1,"from":1,"about":1,"if":1,"me":1,"my":1,"us":1,"our":1,"how":1,"who":1,"what":1,
      "just":1,"also":1,"then":1,"than":1,"when":1,"very":1,"more":1,"some":1};
    var meaningful=words.filter(function(w){return !stopWords[w]&&w.length>1;});
    // Check repetition of meaningful words only
    var freq={};
    meaningful.forEach(function(w){freq[w]=(freq[w]||0)+1;});
    var maxRep=meaningful.length>0?Math.max.apply(null,Object.values(freq)):0;
    if(maxRep>=5)return true; // same meaningful word 5+ times = likely gaming
    // Removal keyword flag
    var noteLower=note.toLowerCase();
    var removeSignals=["remove from my list","not my realtor","not for me","not the right person","please remove","wrong person"];
    if(removeSignals.some(function(sig){return noteLower.indexOf(sig)>=0;}))return true;
    return false;
  }

  var flags=[];
  Object.values(callLogs).forEach(function(log){
    if(log.week_key!==weekKey)return;
    if(isLowQuality(log.note)){
      flags.push({lp:log.lp,agent:log.agent_name,note:log.note||"",date:log.call_date});
    }
  });

  if(!flags.length){
    el.innerHTML='';
    return;
  }

  var html='<div style="background:var(--surface);border:1px solid #E8DDD0;border-radius:10px;overflow:hidden;margin-bottom:1rem">'
    +'<div style="background:#FAF7F2;border-bottom:1px solid #E8DDD0;padding:10px 16px;display:flex;justify-content:space-between;align-items:center">'
    +'<div style="font-size:12px;font-weight:700;color:#5C4A35;text-transform:uppercase;letter-spacing:.04em">⚠️ Note Quality Flags — '+flags.length+' this week</div>'
    +'<div style="font-size:10px;color:#b45309;font-weight:500">Repetitive/gamed wording or removal-flagged</div>'
    +'</div>';

  flags.forEach(function(f){
    var noteDisplay=f.note?'"'+escHtml(f.note)+'"':'<span style="color:#dc2626;font-style:italic">No note</span>';
    html+='<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 16px;border-bottom:1px solid #FAF7F2">'
      +'<span class="lp-tag lp-tag-'+f.lp+'" style="flex-shrink:0;margin-top:2px">'+f.lp+'</span>'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:3px;cursor:pointer;text-decoration:underline" onclick="openLpContactModal(this.getAttribute(&quot;data-n&quot;))" data-n="'+escHtml(f.agent)+'">'+escHtml(f.agent)+'</div>'
      +'<div style="font-size:11px;color:#5C4A35;font-style:italic;word-break:break-word">'+noteDisplay+'</div>'
      +'</div>'
      +'<div style="font-size:11px;color:var(--text-3);flex-shrink:0;white-space:nowrap">'+fmt(f.date)+'</div>'
      +'</div>';
  });

  html+='</div>';
  el.innerHTML=html;
}

function renderChurnRisk(){
  var el=document.getElementById("d-churn-risk-section");
  if(!el)return;
  var activeKeywords2=["preapproval","pre-approval","buyer","contract","offer","working on",
    "pipeline","closing","active","appointment","showing","listing","client","meeting","scheduled"];
  function isActiveAgent(nameUpper){
    // Find agent array entry
    var ag=agents.find(function(a){return a[0].toUpperCase()===nameUpper;});
    if(!ag)return false;
    var note=prevNotes[ag[0]]?prevNotes[ag[0]].note||"":"";
    var noteLower=note.toLowerCase();
    if(activeKeywords2.some(function(kw){return noteLower.indexOf(kw)>=0;}))return true;
    var daysSince=agentLastCall[ag[0]]?Math.floor((TODAY-new Date(agentLastCall[ag[0]]+"T12:00:00"))/86400000):999;
    return daysSince<=tierWindow(ag);
  }
  var highRisk=Object.values(churnRiskData).filter(function(r){return r.churn_risk==="HIGH"&&!isActiveAgent(r.agent_name_upper);});
  var medRisk=Object.values(churnRiskData).filter(function(r){return r.churn_risk==="MEDIUM"&&!isActiveAgent(r.agent_name_upper);});
  if(!highRisk.length&&!medRisk.length){el.innerHTML="";return;}
  var html='<div style="background:var(--surface);border:1px solid #fca5a5;border-radius:10px;overflow:hidden;margin-bottom:1rem">'
    +'<div style="background:#fee2e2;border-bottom:1px solid #fca5a5;padding:10px 16px;display:flex;justify-content:space-between;align-items:center">'
    +'<div style="font-size:12px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:.04em">🔴 Agents at risk — '+(highRisk.length+medRisk.length)+' at risk</div>'
    +'<div style="font-size:10px;color:#dc2626">Has sent leads before — silence now means someone else is moving in</div>'
    +'</div>';
  highRisk.concat(medRisk).slice(0,10).forEach(function(r){
    var isHigh=r.churn_risk==="HIGH";
    var ag=agents.find(function(a){return a[0].toUpperCase()===r.agent_name_upper;});
    var lpName=r.assigned_lp||"?";
    html+='<div style="display:flex;align-items:center;gap:10px;padding:9px 16px;border-bottom:1px solid #fee2e2;flex-wrap:wrap">'
      +'<span style="font-size:11px;width:8px;height:8px;border-radius:50%;background:'+(isHigh?"#dc2626":"#d97706")+';display:inline-block;flex-shrink:0"></span>'
      +'<span style="font-weight:600;font-size:13px;flex:1">'+displayName(ag?ag[0]:r.agent_name_upper)+'</span>'
      +'<span class="lp-tag lp-tag-'+lpName+'">'+lpName+'</span>'
      +'<span style="font-size:11px;color:#991b1b">'+r.total_leads+' leads · last: '+fmt(r.last_lead_date)+'</span>'
      +'<span style="font-size:11px;color:var(--text-3)">'+r.days_since_lead+'d no lead · '+r.days_since_call+'d no call</span>'
      +'</div>';
  });
  html+='</div>';
  el.innerHTML=html;
}

function renderLpEffectiveness(){
  var el=document.getElementById("d-lp-effectiveness-section");
  if(!el||!Object.keys(lpEffectiveness).length)return;
  var html='<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:1rem">'
    +'<div style="background:#1F4E79;padding:10px 16px;display:flex;justify-content:space-between;align-items:center">'
    +'<div style="font-size:12px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.04em">LP Effectiveness — Calls to Leads</div>'
    +'<div style="font-size:10px;color:#93c5fd">MTD referrals per LP</div>'
    +'</div>';
  var sorted=Object.values(lpEffectiveness).sort(function(a,b){return(b.mtd_leads_received||0)-(a.mtd_leads_received||0);});
  sorted.forEach(function(r){
    var lp=r.lp;
    var leads=r.mtd_leads_received||0;
    var correctedPipe=(window.leadPipelineData&&window.leadPipelineData.lps&&window.leadPipelineData.lps[lp])?window.leadPipelineData.lps[lp]:null;
    var files=correctedPipe?correctedPipe.file_starts_mtd:(r.mtd_file_starts||0);
    var calls=r.total_calls_logged||0;
    var ratio=r.leads_per_100_calls||0;
    var ltf=leads>0?Math.round(files/leads*100):0;
    var barPct=Math.min(leads/10,1);
    var barColor=leads>=5?"#15803d":leads>=2?"#d97706":"#94a3b8";
    html+='<div style="padding:10px 16px;border-bottom:1px solid var(--border-light)">'
      +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:5px">'
      +'<span style="font-size:13px;font-weight:700;color:'+LP_COLORS[lp]+';width:55px">'+lp+'</span>'
      +'<span style="font-size:12px;font-weight:700;color:'+barColor+'">'+leads+' lead'+(leads!==1?'s':'')+' MTD</span>'
      +(files>0?'<span style="font-size:11px;color:var(--green)">· '+files+' app'+(files!==1?'s':'')+' converted</span>':'')
      +(ltf>0?'<span style="font-size:11px;color:var(--text-3)">'+ltf+'% lead-to-app</span>':'')
      +'<span style="font-size:10px;color:var(--text-3);margin-left:auto">'+calls+' calls · '+ratio+'/100</span>'
      +'</div>'
      +'<div style="height:4px;background:var(--border-light);border-radius:2px;overflow:hidden">'
      +'<div style="height:100%;width:'+Math.round(barPct*100)+'%;background:'+barColor+';border-radius:2px"></div>'
      +'</div>'
      +'</div>';
  });
  html+='</div>';
  el.innerHTML=html;
}


function runConversionRangeSearch(){
  var startEl=document.getElementById("conv-range-start"),endEl=document.getElementById("conv-range-end");
  var resEl=document.getElementById("conv-range-results");
  var start=startEl?startEl.value:"",end=endEl?endEl.value:"";
  if(!start||!end){if(resEl)resEl.innerHTML='<div style="font-size:12px;color:#E53935">Pick both a start and end date.</div>';return;}
  if(start>end){if(resEl)resEl.innerHTML='<div style="font-size:12px;color:#E53935">Start date must be before end date.</div>';return;}
  if(resEl)resEl.innerHTML='<div style="font-size:12px;color:var(--text-3)">Searching...</div>';
  sbFetch("GET","velocify_leads?date_added=gte."+start+"&date_added=lte."+end+"&select=referral_partner_name,date_added,lp_user,status&limit=20000").then(function(res){
    res=res||[];
    var lpMap={"Dill":"Gavin","Gavin":"Gavin","De La Riva":"Karen","Karen":"Karen",
               "McMahon":"Osgood","Osgood":"Osgood","Johnston":"Jordan","Jordan":"Jordan",
               "Saleh":"Said","Said":"Said","Caldwell":"Isaak","Isaak":"Isaak"};
    function getLp(lp_user){
      if(!lp_user)return null;
      for(var k in lpMap){if(lp_user.toLowerCase().indexOf(k.toLowerCase())>=0)return lpMap[k];}
      return null;
    }
    var LPS_ORDER=["Gavin","Karen","Osgood","Jordan","Said","Isaak"];
    var stats={};
    LPS_ORDER.forEach(function(lp){stats[lp]={total:0,started:0};});
    var teamTotal=0,teamStarted=0,unmatched=0;
    res.forEach(function(r){
      var lp=getLp(r.lp_user);
      var isStarted=ctIsLeadAppConverted(r);
      if(!lp){unmatched++;teamTotal++;if(isStarted)teamStarted++;return;}
      stats[lp].total++;teamTotal++;
      if(isStarted){stats[lp].started++;teamStarted++;}
    });
    var teamPct=teamTotal>0?(teamStarted/teamTotal*100):0;
    var html='<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
    html+='<thead><tr style="background:#1F4E79;color:#fff"><th style="padding:6px 10px;text-align:left">LP</th><th style="padding:6px 10px;text-align:center">Leads</th><th style="padding:6px 10px;text-align:center">Converted to App</th><th style="padding:6px 10px;text-align:center">Lead → App</th></tr></thead><tbody>';
    LPS_ORDER.forEach(function(lp,i){
      var s=stats[lp];var pct=s.total>0?(s.started/s.total*100):0;
      var pc=pct>=65?"#1D9E75":pct>=50?"#BA7517":"#E53935";
      html+='<tr style="background:'+(i%2?"#F5F7FA":"#fff")+'"><td style="padding:6px 10px;font-weight:600">'+lp+'</td><td style="padding:6px 10px;text-align:center">'+s.total+'</td><td style="padding:6px 10px;text-align:center">'+s.started+'</td><td style="padding:6px 10px;text-align:center;font-weight:700;color:'+pc+'">'+pct.toFixed(1)+'%</td></tr>';
    });
    html+='<tr style="background:#EAF1F8;font-weight:700"><td style="padding:6px 10px">Team Total</td><td style="padding:6px 10px;text-align:center">'+teamTotal+'</td><td style="padding:6px 10px;text-align:center">'+teamStarted+'</td><td style="padding:6px 10px;text-align:center">'+teamPct.toFixed(1)+'%</td></tr>';
    html+='</tbody></table></div>';
    html+='<div style="font-size:10px;color:var(--text-3);margin-top:6px">'+start+' to '+end+' · '+res.length+' leads found'+(unmatched?' · '+unmatched+' not matched to a core-team LP':'')+'</div>';
    if(resEl)resEl.innerHTML=html;
  }).catch(function(err){
    if(resEl)resEl.innerHTML='<div style="font-size:12px;color:#E53935">Search failed: '+err.message+'</div>';
  });
}

async function loadLeadPipeline(){
  await loadInactiveRosterNames();
  var now=new Date();
  var todayStr=localDateStr(now);
  var ytdStart=now.getFullYear()+'-01-01';
  // Fetch all leads YTD — enough to compute daily/WTD/MTD/YTD
  // Count self-reported received leads this week for real-time signal
  var selfCount={};
  Object.entries(receivedLeadsData).forEach(function(kv){
    var lp=kv[1].lp;if(lp)selfCount[lp]=(selfCount[lp]||0)+1;
  });
  // Get MTD call counts from lp_call_history_counts for scorecard context
  var lpCallCounts={};
  Object.keys(LP_COLORS).forEach(function(lp){
    // Use call log count from agentLastCall data as proxy for MTD activity
    var lpAgents=agents.filter(function(a){return a[2]===lp;});
    var calledMtd=0;
    var now=new Date();
    var mtdStart=new Date(now.getFullYear(),now.getMonth(),1);
    lpAgents.forEach(function(a){
      if(agentLastCall[a[0]]){
        var lastCall=new Date(agentLastCall[a[0]]+"T12:00:00");
        if(lastCall>=mtdStart)calledMtd++;
      }
    });
    lpCallCounts[lp]=calledMtd;
  });
  return sbFetch("GET","velocify_leads?date_added=gte."+ytdStart+"&select=referral_partner_name,date_added,lp_user,status&order=date_added.desc&limit=5000").then(function(res){
    if(!res||!res.length){renderLeadPipelinePanels([]);return;}

    var lpMap={"Dill":"Gavin","Gavin":"Gavin","De La Riva":"Karen","Karen":"Karen",
               "McMahon":"Osgood","Osgood":"Osgood","Johnston":"Jordan","Jordan":"Jordan",
               "Saleh":"Said","Said":"Said","Caldwell":"Isaak","Isaak":"Isaak"};
    

    var today=new Date();today.setHours(0,0,0,0);
    var todayS=localDateStr(today);
    // WTD: Monday of this week
    var weekDay=today.getDay();
    var monDiff=weekDay===0?-6:1-weekDay;
    var wtdStart=new Date(today);wtdStart.setDate(today.getDate()+monDiff);
    var wtdS=localDateStr(wtdStart);
    // MTD: 1st of month
    var mtdS=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-01';
    var ytdS=today.getFullYear()+'-01-01';

    // Build per-LP counts
    var init=function(){return{daily:0,wtd:0,mtd:0,ytd:0,file_starts_mtd:0,file_starts_ytd:0,agents_mtd:new Set(),agents_ytd:new Set(),quiet_agents:[]};};
    var lps={Gavin:init(),Karen:init(),Osgood:init(),Jordan:init(),Said:init(),Isaak:init()};
    var totals=init();

    res.forEach(function(r){
      var lp=getLp(r.lp_user);
      if(!lp)return;
      var d=r.date_added||"";
      var isFile=ctIsLeadAppConverted(r);
      var agent=(r.referral_partner_name||"").trim().toUpperCase();

      if(d>=ytdS){
        lps[lp].ytd++;totals.ytd++;
        if(agent)lps[lp].agents_ytd.add(agent);
        if(isFile){lps[lp].file_starts_ytd++;}
      }
      if(d>=mtdS){
        lps[lp].mtd++;totals.mtd++;
        if(agent){lps[lp].agents_mtd.add(agent);}
        if(isFile){lps[lp].file_starts_mtd++;totals.file_starts_mtd++;}
      }
      if(d>=wtdS){lps[lp].wtd++;totals.wtd++;}
      if(d===todayS){lps[lp].daily++;totals.daily++;}
    });

    // Find agents who sent leads in prior months but 0 MTD (quiet agents)
    // Use agent_lead_summary data already loaded in VELOCIFY_SEED
    Object.keys(lps).forEach(function(lp){
      var lpAgents=agents.filter(function(a){return a[2]===lp&&isActive(a)&&!ctInactiveRosterNames.has((a[0]||"").trim().toLowerCase());});
      lpAgents.forEach(function(a){
        var vel=getVelocifyForAgent(a[0]);
        if(vel&&vel.total>0&&vel.mtd===0){
          lps[lp].quiet_agents.push({name:a[0],total:vel.total,lastLead:vel.last_lead_date});
        }
      });
      lps[lp].quiet_agents.sort(function(a,b){return b.total-a.total;});
    });

    leadPipelineData={lps:lps,totals:totals,today:todayS};
    window._pipelineRawLeads=res;
    // Update date label in section head
  var dlEl=document.getElementById("pipeline-date-label");
  if(dlEl)dlEl.textContent=new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
  renderLeadPipelinePanels(res);
  if(document.getElementById("view-snapshot")&&document.getElementById("view-snapshot").classList.contains("active")&&!window._lpBootInProgress){buildSnapshot();}
  }).catch(function(e){
    console.warn("loadLeadPipeline error:",e);
    var el=document.getElementById("d-lead-pipeline-today");
    if(el)el.innerHTML='<div style="font-size:12px;color:var(--text-3);padding:8px">Lead data unavailable — check Supabase connection.</div>';
  });
}

function renderLeadPipelinePanels(raw){
  var d=leadPipelineData;
  if(!d||!d.lps){return;}
  var lps=d.lps,totals=d.totals;

  // ── SUMMARY WIDGET for Today tab ──
  var summaryEl=document.getElementById("d-lead-pipeline-today");
  if(summaryEl){
    var s='<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden">';
    s+='<div style="background:#1F4E79;padding:10px 16px;display:flex;justify-content:space-between;align-items:center">';
    s+='<div style="color:#fff;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">Lead pipeline</div>';
    s+='<div style="display:flex;gap:16px">';
    s+='<div style="text-align:center"><div style="color:#fff;font-size:16px;font-weight:700">'+totals.daily+'</div><div style="color:#93c5fd;font-size:9px">TODAY</div></div>';
    s+='<div style="text-align:center"><div style="color:#fff;font-size:16px;font-weight:700">'+totals.wtd+'</div><div style="color:#93c5fd;font-size:9px">WTD</div></div>';
    s+='<div style="text-align:center"><div style="color:#fff;font-size:16px;font-weight:700">'+totals.mtd+'</div><div style="color:#93c5fd;font-size:9px">MTD</div></div>';
    s+='<div style="text-align:center"><div style="color:#fff;font-size:16px;font-weight:700">'+totals.ytd+'</div><div style="color:#93c5fd;font-size:9px">YTD</div></div>';
    s+='<div style="text-align:center"><div style="color:var(--accent);font-size:16px;font-weight:700">'+totals.file_starts_mtd+'</div><div style="color:#93c5fd;font-size:9px">APPS MTD</div></div>';
    s+='</div></div>';

    // Column header row
    s+='<div style="display:flex;align-items:center;gap:8px;padding:5px 16px;background:#f8fafc;border-bottom:1px solid var(--border-light)">';
    s+='<span style="font-size:9px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;width:52px">LP</span>';
    s+='<span style="font-size:9px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;width:20px;text-align:center">Day</span>';
    s+='<span style="font-size:9px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;width:20px;text-align:center">WTD</span>';
    s+='<span style="font-size:9px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;width:28px;text-align:center">MTD</span>';
    s+='<span style="font-size:9px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;width:28px;text-align:center">YTD</span>';
    s+='<span style="font-size:9px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;width:36px;text-align:center">Files</span>';
    s+='<span style="font-size:9px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em">Lead→File %</span>';
    s+='</div>';

    // Per-LP rows
    ["Gavin","Karen","Osgood","Jordan","Said","Isaak"].forEach(function(lp){
      var r=lps[lp];
      var ltf=r.mtd>0?Math.round(r.file_starts_mtd/r.mtd*100):0;
      var col=r.daily>0?"var(--green)":r.wtd>0?"var(--amber-text)":"var(--text-3)";
      var quietCount=r.quiet_agents.length;
      s+='<div style="display:flex;align-items:center;gap:8px;padding:9px 16px;border-bottom:0.5px solid var(--border-light);flex-wrap:wrap;cursor:pointer" onclick="openLpLeadDrilldown(\''+lp+'\',window._pipelineRawLeads||[])" title="Click to see all '+lp+' leads">';
      s+='<span style="font-size:12px;font-weight:700;color:'+LP_COLORS[lp]+';width:52px;cursor:pointer;text-decoration:underline" onclick="goToLP(\''+lp+'\')" title="Open '+lp+'\'s view">'+lp+' &#8599;</span>';
      s+='<span style="font-size:13px;font-weight:700;color:'+col+';width:20px;text-align:center">'+r.daily+'</span>';
      s+='<span style="font-size:12px;color:var(--text-2);width:20px;text-align:center">'+r.wtd+'</span>';
      s+='<span style="font-size:12px;color:var(--text-2);width:28px;text-align:center">'+r.mtd+'</span>';
      s+='<span style="font-size:12px;color:var(--text-3);width:28px;text-align:center">'+r.ytd+'</span>';
      s+='<span style="font-size:11px;color:var(--green);width:36px;text-align:center">'+r.file_starts_mtd+' apps</span>';
      s+=(ltf>0?'<span style="font-size:10px;background:'+(ltf>=20?"#dcfce7":ltf>=10?"#FAF7F2":"#fee2e2")
        +';color:'+(ltf>=20?"#15803d":ltf>=10?"#5C4A35":"#991b1b")+';padding:2px 7px;border-radius:4px">'+ltf+'% lead-to-app</span>':'');
      var quietId='quiet-'+lp;
      var mtdCalled=lpCallCounts[lp]||0;
      var totalLpAgents=agents.filter(function(a){return a[2]===lp&&isActive(a)&&!ctInactiveRosterNames.has((a[0]||"").trim().toLowerCase());}).length;
      var callPct=totalLpAgents>0?Math.round(mtdCalled/totalLpAgents*100):0;
      s+='<span style="font-size:10px;color:var(--text-3);white-space:nowrap">'+mtdCalled+'/'+totalLpAgents+' called MTD</span>';
      s+=(quietCount>0?'<span style="font-size:10px;color:#991b1b;cursor:pointer;text-decoration:underline" data-qid="'+quietId+'" onclick="toggleQuiet(this.getAttribute(\'data-qid\'))">'+quietCount+' agent'+(quietCount>1?'s':'')+' gone quiet ▾</span>':'<span style="font-size:10px;color:var(--text-3);margin-left:auto">'+r.agents_mtd.size+' agents active</span>');
      s+='</div>';
      if(quietCount>0){
        s+='<div id="'+quietId+'" style="display:none;margin-top:6px;padding:6px 0;border-top:1px solid var(--border-light)">';
        r.quiet_agents.slice(0,8).forEach(function(qa){
          var daysSince=qa.lastLead?Math.floor((new Date()-new Date(qa.lastLead+"T12:00:00"))/86400000):null;
          s+='<div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:11px">';
          s+='<span style="flex:1;font-weight:500;color:var(--text)">'+escHtml(displayName(qa.name))+'</span>';
          s+='<span style="color:var(--text-2)">'+qa.total+' leads ever</span>';
          s+=(daysSince!==null?'<span style="color:#991b1b;font-weight:600">'+daysSince+'d silent</span>':'');
          s+='</div>';
        });
        s+='</div>';
        s+='<div style="display:none">'; // dummy to fix the extra </div> below
      } else {
        s+='<div style="display:none">'; // dummy
      }
      s+='</div>';
    });
    s+='</div>';
    summaryEl.innerHTML=s;
  }

  // ── FULL BREAKDOWN for Active Agent Roster tab ──
  var fullEl=document.getElementById("d-lead-pipeline-full");
  if(fullEl){
    var f='<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:1rem">';
    f+='<div style="background:#1F4E79;padding:10px 16px">';
    f+='<div style="color:#fff;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">Lead pipeline — retention & conversion</div>';
    f+='</div>';

    ["Gavin","Karen","Osgood","Jordan","Said","Isaak"].forEach(function(lp){
      var r=lps[lp];
      var ltfMtd=r.mtd>0?Math.round(r.file_starts_mtd/r.mtd*100):0;
      var ltfYtd=r.ytd>0?Math.round(r.file_starts_ytd/r.ytd*100):0;

      f+='<div style="border-bottom:1px solid var(--border-light)">';
      // LP header row
      f+='<div style="padding:10px 16px;background:var(--bg);display:flex;align-items:center;gap:10px;flex-wrap:wrap">';
      f+='<span style="font-size:13px;font-weight:700;color:'+LP_COLORS[lp]+';width:60px">'+lp+'</span>';
      f+='<div style="display:flex;gap:10px;flex-wrap:wrap;flex:1">';
      f+='<span style="font-size:11px"><b>'+r.daily+'</b> <span style="color:var(--text-3)">today</span></span>';
      f+='<span style="font-size:11px"><b>'+r.wtd+'</b> <span style="color:var(--text-3)">WTD</span></span>';
      f+='<span style="font-size:11px"><b>'+r.mtd+'</b> <span style="color:var(--text-3)">MTD</span></span>';
      f+='<span style="font-size:11px"><b>'+r.ytd+'</b> <span style="color:var(--text-3)">YTD</span></span>';
      f+='<span style="font-size:11px;color:var(--green)"><b>'+r.file_starts_mtd+'</b> apps MTD</span>';
      f+=(ltfMtd>0?'<span style="font-size:10px;background:'+(ltfMtd>=20?"#dcfce7":ltfMtd>=10?"#FAF7F2":"#fee2e2")+';color:'+(ltfMtd>=20?"#15803d":ltfMtd>=10?"#5C4A35":"#991b1b")+';padding:2px 8px;border-radius:4px;font-weight:600">'+ltfMtd+'% lead-to-app</span>':"");
      f+='</div>';
      f+='<span style="font-size:11px;color:var(--text-3)">'+r.agents_mtd.size+' agents active MTD · '+r.agents_ytd.size+' YTD</span>';
      f+='</div>';

      // Gone quiet agents (sent before, 0 MTD) — retention risk
      if(r.quiet_agents.length){
        f+='<div style="padding:6px 16px 8px">';
        f+='<div style="font-size:10px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px">Gone quiet — sent leads before, 0 this month</div>';
        r.quiet_agents.slice(0,6).forEach(function(a){
          var daysSince=a.lastLead?Math.floor((new Date()-new Date(a.lastLead+"T12:00:00"))/86400000):null;
          f+='<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:0.5px solid #fee2e2">';
          f+='<span style="font-size:12px;font-weight:500;color:var(--text);flex:1">'+escHtml(displayName(a.name))+'</span>';
          f+='<span style="font-size:11px;color:var(--text-2)">'+a.total+' lead'+(a.total!==1?'s':'')+' ever</span>';
          f+=(daysSince!==null?'<span style="font-size:11px;color:#991b1b">'+daysSince+'d since last</span>':"");
          f+='</div>';
        });
        if(r.quiet_agents.length>6)f+='<div style="font-size:10px;color:var(--text-3);margin-top:4px">+'+( r.quiet_agents.length-6)+' more</div>';
        f+='</div>';
      } else {
        f+='<div style="padding:6px 16px 8px;font-size:11px;color:var(--green)">&#10003; All active agents sending leads this month</div>';
      }
      f+='</div>';
    });
    f+='</div>';
    fullEl.innerHTML=f;
  }
}

function closeDrilldown(){
  document.getElementById("lead-drilldown-overlay").style.display="none";
}

function openLpLeadDrilldown(lp, rawLeads){
  // Filter leads for this LP
  var lpMap={"Dill":"Gavin","Gavin":"Gavin","De La Riva":"Karen","Karen":"Karen",
    "McMahon":"Osgood","Osgood":"Osgood","Johnston":"Jordan","Jordan":"Jordan",
    "Saleh":"Said","Said":"Said","Caldwell":"Isaak","Isaak":"Isaak"};
  function getLpName(lp_user){
    if(!lp_user)return null;
    for(var k in lpMap){if(lp_user.toLowerCase().indexOf(k.toLowerCase())>=0)return lpMap[k];}
    return null;
  }
  var leads=rawLeads.filter(function(r){return getLpName(r.lp_user)===lp;})
    .sort(function(a,b){return(b.date_added||"").localeCompare(a.date_added||"");});

  document.getElementById("drilldown-title").textContent=lp+" — Leads from Velocify ("+leads.length+" total)";
  var overlay=document.getElementById("lead-drilldown-overlay");

  if(!leads.length){
    document.getElementById("drilldown-body").innerHTML='<div style="padding:24px;text-align:center;color:var(--text-3);font-size:13px">No leads found for '+lp+'</div>';
    overlay.style.display="flex";return;
  }

  var h='<div style="padding:0">';
  // Group by month
  var byMonth={};
  leads.forEach(function(r){
    var mo=r.date_added?r.date_added.substring(0,7):"Unknown";
    if(!byMonth[mo])byMonth[mo]=[];
    byMonth[mo].push(r);
  });
  Object.keys(byMonth).sort().reverse().forEach(function(mo){
    var moLeads=byMonth[mo];
    var moDate=new Date(mo+"-01T12:00:00");
    var moLabel=moDate.toLocaleDateString("en-US",{month:"long",year:"numeric"});
    h+='<div style="padding:8px 16px;background:var(--bg);border-bottom:1px solid var(--border-light);font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em">'+moLabel+' ('+moLeads.length+')</div>';
    moLeads.forEach(function(r){
      var agent=escHtml(r.referral_partner_name||"Unknown agent");
      var buyer=r.buyer_name?escHtml(r.buyer_name):"—";
      var date=r.date_added?new Date(r.date_added+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}):"—";
      var daysSince=r.date_added?Math.floor((new Date()-new Date(r.date_added+"T12:00:00"))/86400000):null;
      var status=r.status||"—";
      var statusLower=status.toLowerCase();
      var negativeApp=statusLower.indexOf("withdrawn")>=0||statusLower.indexOf("denied")>=0;
      var statusBg=negativeApp?"#fee2e2":ctIsLeadAppConverted(r)?"#dcfce7":statusLower.indexOf("contact")>=0?"#dbeafe":"#f1f5f9";
      var statusColor=negativeApp?"#991b1b":ctIsLeadAppConverted(r)?"#15803d":statusLower.indexOf("contact")>=0?"#1e40af":"#475569";
      h+='<div style="padding:10px 16px;border-bottom:1px solid var(--border-light);display:flex;align-items:flex-start;gap:10px">';
      h+='<div style="flex:1;min-width:0">';
      h+='<div style="font-size:12px;font-weight:700;color:var(--text)">'+agent+'</div>';
      h+='<div style="font-size:11px;color:var(--text-2);margin-top:2px">Buyer: '+buyer+'</div>';
      if(r.last_action_note&&r.last_action_note.toLowerCase()!=="empty"){
        h+='<div style="font-size:11px;color:var(--text-3);font-style:italic;margin-top:2px">"'+escHtml(r.last_action_note.substring(0,80))+'"</div>';
      }
      h+='</div>';
      h+='<div style="text-align:right;flex-shrink:0">';
      h+='<div style="font-size:12px;font-weight:600;color:var(--text)">'+date+'</div>';
      h+=(daysSince!==null?'<div style="font-size:10px;color:'+(daysSince>=30?"#991b1b":"var(--text-3)")+'">'+daysSince+'d ago</div>':"");
      h+='<div style="margin-top:4px"><span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;background:'+statusBg+';color:'+statusColor+'">'+status+'</span></div>';
      h+='</div>';
      h+='</div>';
    });
  });
  h+='</div>';
  document.getElementById("drilldown-body").innerHTML=h;
  overlay.style.display="flex";
}

function toggleQuiet(id){
  var el=document.getElementById(id);
  if(el)el.style.display=el.style.display==="none"?"block":"none";
}

function goToLP(lp, showCarryover){
  var btns=document.querySelectorAll(".who-btn");
  var btn=null;
  for(var i=0;i<btns.length;i++){
    if(btns[i].textContent.trim()===lp){btn=btns[i];break;}
  }
  selectUser(btn,lp);
  if(showCarryover){
    loadCallLogs().then(function(){
      renderLP(lp);
      setTimeout(function(){toggleCarryoverList(lp);},200);
    });
  }
}

function renderAllClear(){
  var el=document.getElementById("d-allclear-section");
  if(!el)return;
  var carryoverEl=document.getElementById("d-carryover-section");
  var qualityEl=document.getElementById("d-note-quality-section");
  var hasCarryover=carryoverEl&&carryoverEl.innerHTML.trim().length>10;
  var hasQualityFlags=qualityEl&&qualityEl.innerHTML.trim().length>10;
  if(hasCarryover||hasQualityFlags){el.innerHTML="";return;}
  var totalOverdue=0;
  LPS.forEach(function(lp){
    agents.filter(function(a){return a[2]===lp&&isActive(a);}).forEach(function(a){
      if(daysOverdue(a)>0)totalOverdue++;
    });
  });
  if(totalOverdue>5){el.innerHTML="";return;}
  el.innerHTML='<div style="display:flex;align-items:center;gap:12px;background:var(--green-bg);border:1px solid var(--green-border);border-radius:var(--radius-md);padding:14px 18px">'
    +'<div style="width:34px;height:34px;background:var(--accent);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#fff;font-size:16px;font-weight:700">✓</div>'
    +'<div><div style="font-size:13px;font-weight:700;color:var(--text)">Team is on track</div>'
    +'<div style="font-size:12px;color:var(--text-2);margin-top:2px">No carryover · No note flags · '
    +(totalOverdue===0?"All agents contacted on schedule":totalOverdue+" agents slightly overdue")
    +'</div></div></div>';
}


function loadAmandaSnapshot(){
  var now=new Date();
  var monthStart=now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-01";
  var todayStr=localDateStr(now);
  var week=rmWeekRange();
  return sbFetch("GET","amanda_activities?act_date=gte."+monthStart+"&select=agent_name,act_type,act_date,notes,outcome&limit=2000").then(function(rows){
    if(!rows||!Array.isArray(rows))return;
    // Snapshot Amanda metrics must not count Nyny activities stored in the same RM activity table.
    rows=rows.filter(function(r){return ctRmOwnerFromNotes(r.notes)==="Amanda";});
    window.rmFeedCache=window.rmFeedCache||{};
    window.rmFeedCache.mtd=rows;
    window.rmFeedCache.week=rows.filter(function(r){return r.act_date>=week.start&&r.act_date<=week.end;});
    window.rmFeedCache.today=rows.filter(function(r){return r.act_date===todayStr;});
    // Also set rmActsCache format
    window.rmActsCache={acts:rows,todayStr:todayStr,week:week,monthStart:monthStart};
    if(document.getElementById("view-snapshot")&&document.getElementById("view-snapshot").classList.contains("active")){
      buildSnapshot();
    }
  }).catch(function(err){console.warn("Amanda snapshot load failed:",err);});
}

function showLpInactiveAgents(lp){
  var list=(agents||[]).filter(function(a){return a[2]===lp&&ctRosterEligible(a)&&!isActive(a);}).sort(function(a,b){return a[0].localeCompare(b[0]);});
  var ov=document.getElementById("lead-drilldown-overlay"),title=document.getElementById("drilldown-title"),body=document.getElementById("drilldown-body");
  if(!ov||!title||!body)return;
  title.textContent=lp+" — inactive relationships (90+ days)";
  if(!list.length){body.innerHTML='<div style="padding:18px;color:var(--text-3)">No inactive agents for '+lp+'.</div>';}
  else{body.innerHTML='<div style="padding:12px 16px;font-size:11px;color:var(--text-3);border-bottom:1px solid var(--border)">These relationships still belong to '+lp+' and show 90+ days without activity, so the weekly rotation skips them. The tracker hides explicitly removed relationships.</div>'+list.map(function(a){var mr=mostRecent(a);return '<div style="display:flex;align-items:center;gap:10px;padding:11px 16px;border-bottom:1px solid var(--border-light)"><span style="font-weight:700;flex:1">'+displayName(a[0])+'</span><span class="badge badge-'+String(a[1]||"C").toLowerCase()+'">'+(a[1]||"C")+'</span><span style="font-size:11px;color:var(--text-3)">'+(mr?'Last activity: '+fmt(mr):'No activity on file')+'</span></div>';}).join('');}
  ov.style.display="flex";
}

var lpSnapshotHydrationSeq=0;
var lpSnapshotHydratedAt=0;
var lpSnapshotHydrationPromise=null;

function lpSnapshotSetStatus(msg,isError){
  var s=document.getElementById("snapshot-live-status");
  if(s){s.textContent=msg||"";s.style.color=isError?"#B42318":"var(--text-3)";}
}
function lpSnapshotSafe(label,fn){
  try{
    return Promise.resolve(fn()).then(function(v){return{label:label,ok:true,value:v};}).catch(function(e){console.warn("Snapshot source "+label+" failed:",e);return{label:label,ok:false,error:e};});
  }catch(e){console.warn("Snapshot source "+label+" failed:",e);return Promise.resolve({label:label,ok:false,error:e});}
}
function lpLoadSnapshotScorecardsFresh(){
  var wk=getWeekKey(new Date()),persons=LPS.concat(["Amanda"]);
  return sbFetch("GET","lp_scorecards?week_key=eq."+wk+"&person=in.("+persons.join(",")+")&select=person,data").then(function(res){
    window._snapScWeek=wk;window._snapScData={};
    (res||[]).forEach(function(r){window._snapScData[r.person]=r.data||{};});
    return res||[];
  });
}
async function lpLoadSnapshotFresh(opts){
  opts=opts||{};
  var seq=++lpSnapshotHydrationSeq;
  if(lpSnapshotHydrationPromise&&!opts.force)return lpSnapshotHydrationPromise;
  var body=document.getElementById("d-snapshot-body"),btn=document.getElementById("snapshot-live-refresh");
  if(body)body.innerHTML='<div style="padding:32px;text-align:center;color:var(--text-3);font-size:13px"><div style="font-weight:750;color:#071B37;margin-bottom:5px">Syncing live team data...</div><div>Current assignments · calls · leads · scorecards · RM activity</div></div>';
  if(btn){btn.disabled=true;btn.textContent="Syncing...";}
  lpSnapshotSetStatus("Syncing current assignments, calls, leads, and RM activity before showing totals...");
  window._lpBootInProgress=true;setSyncStatus("loading");

  lpSnapshotHydrationPromise=(async function(){
    // Batch 1 establishes the roster and ownership FIRST. Snapshot call totals depend on
    // the current LP assignment, so rendering before this finishes creates the stale first paint.
    var core=await Promise.all([
      lpSnapshotSafe("inactive roster",loadInactiveRosterNames),
      lpSnapshotSafe("assignments",loadAgentAssignments),
      lpSnapshotSafe("call logs",loadCallLogs)
    ]);
    if(seq!==lpSnapshotHydrationSeq)return false;

    // Batch 2 loads every source used by the Snapshot before it is allowed to paint.
    var context=await Promise.all([
      lpSnapshotSafe("agent call history",loadAgentFirstCalls),
      lpSnapshotSafe("RM activity",loadRmActivity),
      lpSnapshotSafe("received leads",loadReceivedLeads),
      lpSnapshotSafe("Velocify summary",loadVelocifyLeads),
      lpSnapshotSafe("RM follow-ups",loadRmFollowups),
      lpSnapshotSafe("Amanda activity",loadAmandaSnapshot),
      lpSnapshotSafe("scorecards",lpLoadSnapshotScorecardsFresh)
    ]);
    if(seq!==lpSnapshotHydrationSeq)return false;

    // Lead pipeline uses current assignments plus lead sources, so it runs after both batches.
    var pipe=await lpSnapshotSafe("lead pipeline",loadLeadPipeline);
    if(seq!==lpSnapshotHydrationSeq)return false;

    lpSnapshotHydratedAt=Date.now();
    if(currentUser==="Snapshot"||document.getElementById("view-snapshot")?.classList.contains("active"))buildSnapshot();
    var failures=core.concat(context,[pipe]).filter(function(x){return x&&x.ok===false;});
    if(failures.length){
      lpSnapshotSetStatus("Live Snapshot loaded, but "+failures.length+" optional source"+(failures.length===1?"":"s")+" could not refresh. Click Refresh Live Data to retry.",true);
    }else{
      lpSnapshotSetStatus("Live Snapshot synced from current server data · "+new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}));
      setSyncStatus("live");
    }
    return true;
  })().catch(function(e){
    console.warn("Authoritative Snapshot load failed:",e);lpSnapshotSetStatus("Snapshot could not fully sync. Click Refresh Live Data to retry.",true);lpHandleSyncError(e);return false;
  }).finally(function(){
    if(seq===lpSnapshotHydrationSeq){window._lpBootInProgress=false;lpSnapshotHydrationPromise=null;if(btn){btn.disabled=false;btn.innerHTML="&#8635; Refresh Live Data";}}
  });
  return lpSnapshotHydrationPromise;
}
window.lpLoadSnapshotFresh=lpLoadSnapshotFresh;
window.refreshSnapshotFresh=function(btn){return lpLoadSnapshotFresh({force:true});};

function openSnapshotView(btn){
  if(typeof rmStopPolling==="function")rmStopPolling();
  if(typeof lpStopPolling==="function")lpStopPolling();
  currentUser="Snapshot";
  document.querySelectorAll(".who-btn").forEach(function(b){b.classList.remove("active");});
  if(btn)btn.classList.add("active");
  document.querySelectorAll(".view").forEach(function(v){v.classList.remove("active");});
  var view=document.getElementById("view-snapshot");if(view)view.classList.add("active");
  return lpLoadSnapshotFresh({force:true});
}

function amCnt(src,type){
  return (src||[]).filter(function(a){return (a.act_type||"").trim()===type;}).length;
}
function amCntTalkTo(src){
  // Keep this shared snapshot counter aligned with the RM Tracker's current logger.
  // The UI label changed over time, so historical and current labels all receive
  // the same Talk-To credit instead of silently dropping valid Amanda activity.
  var TALKTO_TYPES=["Agent Talk-to","Agent Partner conversation","Partner conversation","Talk-to (text/call)","Active Agent Talk-to","Active Agent Check-in","Reconnect Outreach","CTC Call","Under Contract Call","Listing Agent Update","Birthday Outreach","Holiday Outreach","Agent Appreciation","Market Update","Market Update Call","Sent Market Report","Sent Referral","Co-Marketing Discussion","New Agent Follow-up","Closed Deal Thank You","Recruiting Conversation"];
  return (src||[]).filter(function(a){
    if(TALKTO_TYPES.indexOf((a.act_type||"").trim())<0)return false;
    var o=String(a.outcome||'').trim().toLowerCase();
    return !!o&&!/left voicemail|left vm|no answer|attempted|no response|remove \/ no further contact|not interested|do not contact/.test(o);
  }).length;
}


function buildSnapshot(){
  var el=document.getElementById("d-snapshot-body");
  var timeEl=document.getElementById("snapshot-time");
  if(!el)return;
  var now=new Date();
  if(timeEl)timeEl.textContent="as of "+now.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});

  if(!agents||!agents.length){
    el.innerHTML='<div style="padding:32px;text-align:center;color:var(--text-3);font-size:13px">Loading team data...</div>';
    setTimeout(buildSnapshot,1500);return;
  }

  // Pace: what % of week is done by now (Mon-Fri, 8am-6pm)
  var dow=now.getDay();
  var workDaysGone=[0,0,.2,.4,.6,.8,1][dow];
  var hourPct=Math.max(0,Math.min((now.getHours()-8)/10,1));
  var paceFraction=Math.min(workDaysGone+(dow>=1&&dow<=5?hourPct*.2:0),1);

  // LP call counts this week
  var callsLogged={};
  LPS.forEach(function(lp){callsLogged[lp]=0;});
  agents.forEach(function(a){
    if(ctRosterEligible(a)&&callLogs[a[0]]&&isActive(a)&&a[2]&&callsLogged[a[2]]!==undefined)callsLogged[a[2]]++;
  });
  var totalCallsWTD=Object.values(callsLogged).reduce(function(s,n){return s+n;},0);

  // Leads from pipeline
  var lpd=window.leadPipelineData;
  var leadsToday=0,leadsWTD=0,leadsMTD=0;
  var lpLeadsToday={},lpLeadsWTD={};
  LPS.forEach(function(lp){
    var r=lpd&&lpd.lps&&lpd.lps[lp]?lpd.lps[lp]:{};
    lpLeadsToday[lp]=r.daily||0;lpLeadsWTD[lp]=r.wtd||0;
    leadsToday+=r.daily||0;leadsWTD+=r.wtd||0;leadsMTD+=r.mtd||0;
  });

  // Scorecard data — load from lp_scorecards for this week
  var weekKey=getWeekKey(now);
  var snapScData=window._snapScData||{};

  // Fetch scorecard data if not cached
  if(!window._snapScWeek||window._snapScWeek!==weekKey){
    window._snapScWeek=weekKey;
    var persons=LPS.concat(["Amanda"]);
    sbFetch("GET","lp_scorecards?week_key=eq."+weekKey+"&select=person,data").then(function(res){
      window._snapScData={};
      if(res)res.forEach(function(r){window._snapScData[r.person]=r.data||{};});
      buildSnapshot();
    }).catch(function(){});
    // Render with call data while scorecard loads
  }

  // Amanda activity counts this week
  var amandaWeek=(window.rmFeedCache&&window.rmFeedCache.week)?window.rmFeedCache.week.length:0;
  var amandaToday=(window.rmFeedCache&&window.rmFeedCache.today)?window.rmFeedCache.today.length:0;
  var amandaFlagged=0;
  try{var fc=document.getElementById("rm-flagged-count");if(fc)amandaFlagged=parseInt(fc.textContent)||0;}catch(e){}

  // Isaak scorecard data
  var isaakData=snapScData["Isaak"]||{};
  var isaakCalls=lpHistoryCallCounts&&(lpHistoryCallCounts["Isaak"]||lpHistoryCallCounts["isaak"])||0;
  // Also try scorecard data for Isaak calls
  var isaakScCalls=scTotal(snapScData["Isaak"]||{},"realtor_calls");
  if(isaakScCalls>isaakCalls)isaakCalls=isaakScCalls;
  function scTotal(data,key){
    var t=0;
    ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].forEach(function(d){t+=parseInt(data[key+"_"+d]||0)||0;});
    return t;
  }

  // Daily culture moment: rotating dad jokes + a curated punchy sales-team quote deck.
  // Sales fuel is original to this tracker so we do not rely on shaky/misattributed internet quotes.
  var dayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  var yearStart=new Date(now.getFullYear(),0,1);
  var dayOfYear=Math.floor((dayStart-yearStart)/86400000);
  var DAILY_LAUGHS=["Why did the cheese fail the test? It wasn't very sharp.","What type of cheese can hide a horse? Mascarpone.","What cheese is made backward? Edam.","Why did the pizza apply for a job? It kneaded the dough.","What does a pizza say when it introduces itself? Slice to meet you.","Why did the pizza maker go broke? He just couldn't make enough dough.","What do you call a sleeping pizza? A piZZZa.","Why did the taco refuse to argue? It didn't want to spill the beans.","What did the tortilla chip say to the cheese? This is nacho problem.","What do you call a cheese that works out? Shredded.","What do you call a hot dog wearing a sweater? A chili dog.","Why did the hamburger go to the gym? To get better buns.","Why did the burger marry the fries? They were a perfect combo.","What do you call a sandwich that tells jokes? A pun-ini.","Why don't sandwiches tell secrets? They always get spread around.","What do you call a peanut in a spacesuit? An astro-nut.","Why was the peanut embarrassed? It got roasted.","What did the almond say to the peanut? You're nuts.","What do you call a cashew in charge? The big cheese. Wait... wrong snack.","Why did the cereal get promoted? It was always raisin the bar.","What do you call a cereal thief? A serial offender.","What did one plate say to the other plate? Dinner's on me.","Why did the spoon quit? It was tired of stirring things up.","Why did the fork get promoted? It always took the right tine.","Why did the knife get invited? It was a cut above the rest.","Why did the refrigerator apply for a job? It wanted a cool position.","What did the fridge say to the freezer? Chill out.","Why did the microwave break up with the oven? Things got too heated.","Why was the vacuum bad at keeping secrets? It always sucked everything up.","Why did the lamp get a raise? It was brilliant.","Why did the light bulb fail school? It wasn't very bright.","How many tickles does it take to make an octopus laugh? Ten-tickles.","What did one toilet say to the other? You look flushed.","Why did the toilet paper roll down the hill? To get to the bottom.","Why did the soap quit its job? It was washed up.","Why did the towel get promoted? It always soaked up knowledge.","Why was the pillow so confident? It had a lot of support.","What did the blanket say to the bed? I've got you covered.","Why did the bed go to the doctor? It had spring fever.","Why did the chair get promoted? It always stood by the team.","Why did the table get a raise? It brought a lot to the table.","Why was the door so polite? It always opened up to people.","Why did the window get a job? It had a clear outlook.","Why did the ceiling get promoted? It was over everyone's head.","Why did the floor win an award? It was grounded.","Why did the stairs get promoted? They were always stepping up.","Why did the elevator break up with the stairs? It wanted to take things to another level.","Why did the roof go to school? It wanted to raise the ceiling.","Why was the house cold? It left its Windows open.","Why did the mailbox feel important? It always delivered.","Why did the envelope feel confident? It had everything sealed.","Why did the stamp go to therapy? It was stuck on the past.","Why did the pencil get promoted? It had a sharp point of view.","Why did the pencil break up with the eraser? It couldn't erase the past.","Why did the pen get sent home? It couldn't draw the line.","Why did the paper go to the gym? It wanted to get ripped.","Why did the notebook feel confident? It had all its notes together.","Why was the ruler so bossy? It always had to measure up.","Why did the scissors win the argument? They had a cutting remark.","Why did the stapler get promoted? It always held things together.","Why did the paper clip get a medal? It kept everything together under pressure.","Why did the printer get angry? It had a paper jam.","Why did the printer need glasses? It couldn't see the fine print.","Why did the keyboard go to sleep? It needed some space.","Why was the keyboard calm? It had control.","What is a computer's favorite snack? Microchips.","Why did the computer take a break? It needed to reboot its attitude.","Why did the mouse bring a suitcase? It wanted to travel the web.","Why was the internet cold? Too many frozen screens.","Why did Wi-Fi break up with the router? There was no connection.","Why did the phone wear glasses? It lost its contacts.","Why did the smartphone need therapy? It lost its sense of connection.","Why did the battery get promoted? It had positive energy.","Why did the charger get invited to the party? It brought the energy.","Why was the calendar popular? It had a lot of dates.","Why did the calendar get fired? It took too many days off.","What is a clock's favorite food? Seconds.","Why did the watch go on vacation? It needed time off.","Why did the hourglass feel pressured? Time was running out.","Why did the alarm clock get in trouble? It kept raising alarms.","Why did the map get a promotion? It always knew the way.","Why did the globe feel important? The world revolved around it.","Why did the compass get promoted? It always pointed the team in the right direction.","Why did the road get tired? It had been driven all day.","Why was the traffic light embarrassed? It changed in front of everyone.","Why did the car take a nap? It was exhausted.","Why did the car bring a sweater? It had a little chill in the radiator.","What kind of car does an egg drive? A yolks-wagen.","What kind of car does a sheep drive? A Lamborghini.","Why did the bicycle apply for a job? It wanted to get ahead in the cycle.","Why did the motorcycle fall over? It was two-tired too.","Why did the bus stop? Because it saw the bus stop.","Why did the train eat dinner? It had a lot of chew-chew.","Why are trains so good at their jobs? They stay on track.","Why did the airplane get sent to its room? It had a bad altitude.","Why did the pilot study? To improve his plane knowledge.","Why did the boat get promoted? It was always making waves.","Why did the boat blush? It saw the ocean's bottom.","What do you call a boat full of dentists? A tooth ferry.","Why did the astronaut break up with the moon? It needed space.","Why did the moon skip dinner? It was full.","Why is the moon so broke? It is down to its last quarter.","Why did the sun go to school? To get a little brighter.","What did Earth say to the other planets? You guys have no life.","Why did Saturn get promoted? It had a lot of rings of experience.","What is an astronaut's favorite part of a computer? The space bar.","Why did Mars go to the party? It needed a little space to mingle.","Why don't planets argue? They prefer to keep things in orbit.","What do you call a star that tells jokes? A comedi-star.","Why was the star so popular? It had a lot of fans in its orbit.","Why did the cloud stay home? It was feeling under the weather.","What does a cloud wear under its raincoat? Thunderwear.","Why did the thunder get a promotion? It made a big impact.","What did one lightning bolt say to the other? You're shocking.","Why did the snowman look through the carrots? He was picking his nose.","What do snowmen eat for breakfast? Frosted Flakes.","What do you call an old snowman? Water.","Why did the snowflake get promoted? It was one of a kind.","Why was the wind so good at gossip? It always blew things around.","Why did the rainbow get promoted? It showed a lot of color.","Why did the raindrop break up with the cloud? It needed to fall for itself.","Why did the tornado get a job? It wanted to make a whirlwind of a difference.","Why did the hurricane bring a map? It didn't want to get carried away.","Why is it hard to trust stairs? They're always up to something.","Why did the mountain get promoted? It peaked at the right time.","Why did the hill feel confident? It knew it could rise to the occasion.","Why did the river get promoted? It went with the flow.","Why did the lake feel calm? It was very well grounded.","Why did the beach blush? The sea weed.","Why did the ocean break up with the pond? It needed more depth.","What does a sea monster eat for lunch? Fish and ships.","What do you call a crab that plays baseball? A pinch hitter.","Why did the clam stop talking? It clammed up.","Why did the oyster refuse to argue? It didn't want to shell out an opinion.","What do you call a whale who tells jokes? A killer comedian.","Why did the dolphin bring a towel? For porpoises.","Why did the shark stop swimming? It needed a break from the current.","What do sharks eat with peanut butter? Jellyfish.","Why did the octopus cross the road? To get to the other tide.","What did the fish say when it hit a wall? Dam.","Why did the fisherman put peanut butter into the sea? To go with the jellyfish.","Why are mountains always tired? They peak too early.","Why did the tree take a nap? It was bushed.","Why did the tree go to the dentist? It needed a root canal.","Why are trees good at networking? They branch out.","Why did the leaf go to the doctor? It was feeling green.","Why did the flower get promoted? It was blooming with potential.","Why did the flower take a break? It needed to stop and smell itself.","Why was the rose embarrassed? It got caught petaling around.","Why did the cactus get invited to the party? It was looking sharp.","Why did the cactus avoid hugs? It was a little prickly.","Why did the mushroom have so many friends? He was a fungi to be around.","Why did the seed get promoted? It showed a lot of growth potential.","Why did the lawn get a raise? It was cutting edge.","Why did the grass whisper? It didn't want to be mowed over.","Why did the shovel get promoted? It was groundbreaking.","Why did the rake get promoted? It always pulled things together.","Why did the watering can get promoted? It helped everyone grow.","Why did the sunflowers face east? They were outstanding in their field.","Why did the gardener plant light bulbs? He wanted to grow a power plant.","Why did the scientist install a knocker on his door? He wanted to win the no-bell prize.","What do you call a scientist who studies soda? A fizz-icist.","Why did the physicist refuse to argue? There was too much tension.","What do you call a chemist who is good at solving problems? A solution expert.","Why are chemists great at parties? They have all the solutions.","What do you do with a sick chemist? If you can't helium and you can't curium, you might as well barium.","What element is a girl's future best friend? Carbon.","What did the oxygen say to magnesium? OMg.","Why did the proton get invited? It was positive.","Why did the electron refuse the invitation? It was feeling negative.","Why can't you trust an atom? They make up literally everything.","What do you call iron blowing in the wind? Fe breeze.","What do you call a periodic table that sings? Elemental music.","Why did the mathematician spill coffee? He had too many variables.","Why was the equal sign so humble? It knew it wasn't less than or greater than anyone else.","Why did the fraction feel nervous? It was under a lot of division.","Why was the geometry teacher late? He took the wrong angle.","What do you call friends who love math? Algebros.","Why did the student wear glasses in math class? To improve di-vision.","What did the triangle say to the circle? You're pointless.","What did the circle say to the triangle? You're too edgy.","Why did the obtuse angle go to the beach? It was over 90 degrees.","Why was the math lecture so long? The professor kept going off on a tangent.","Why did the number 4 skip lunch? It already eight.","Why did zero and eight become friends? They had a well-rounded relationship.","Why was the history book nervous? It had a lot of dates.","Why did the geography book break up with the map? It needed more space.","Why did the English teacher love fishing? She was great with hooks.","Have you heard the joke about potassium? K.","Why don't skeletons fight each other? They don't have the guts.","What do you call cheese that isn't yours? Nacho cheese.","Why did the scarecrow win an award? He was outstanding in his field.","Why couldn't the bicycle stand up by itself? It was two-tired.","What do you call fake spaghetti? An impasta.","Why did the math book look sad? It had too many problems.","What do you call a fish wearing a bowtie? Sofishticated.","What did one wall say to the other wall? I'll meet you at the corner.","Why did the golfer bring two pairs of pants? In case he got a hole in one.","What do you call a bear with no teeth? A gummy bear.","Why don't eggs tell jokes? They'd crack each other up.","What did the ocean say to the beach? Nothing. It just waved.","Why was six afraid of seven? Because seven eight nine.","What do you call a sleeping bull? A bulldozer.","Why did the tomato blush? Because it saw the salad dressing.","What do you call a factory that makes okay products? A satisfactory.","Why couldn't the pony sing? It was a little hoarse.","What did the janitor say when he jumped out of the closet? Supplies!","Why do melons have weddings? Because they cantaloupe.","What do you call a dog magician? A labracadabrador.","Why did the coffee file a police report? It got mugged.","What kind of shoes do ninjas wear? Sneakers.","Why did the cookie go to the doctor? It felt crummy.","What do you call a pile of cats? A meow-ntain.","Why did the stadium get hot after the game? All the fans left.","How does a penguin build its house? Igloos it together.","Why don't oysters donate to charity? Because they're shellfish.","What did one hat say to the other? You stay here. I'll go on ahead.","Why did the banana go to the doctor? It wasn't peeling well.","What do you call a cow with no legs? Ground beef.","What do you call a cow with two legs? Lean beef.","Why can't your nose be 12 inches long? Because then it would be a foot.","What did the zero say to the eight? Nice belt.","Why did the computer go to the doctor? It had a virus.","What do you call a belt made of watches? A waist of time.","Why was the broom late? It swept in.","What did the grape do when it got stepped on? Nothing. It just let out a little wine.","Why are elevator jokes so good? They work on many levels.","What kind of music do balloons hate? Pop.","What do you call a boomerang that won't come back? A stick.","Why did the picture go to jail? Because it was framed.","What do you call an alligator in a vest? An investigator.","Why did the chicken join a band? Because it had the drumsticks.","Why did the man fall into the well? Because he couldn't see that well.","What do you call a dinosaur with an extensive vocabulary? A thesaurus.","Why did the invisible man turn down the job offer? He couldn't see himself doing it.","Why did the orange stop rolling down the hill? It ran out of juice.","What do you call a can opener that doesn't work? A can't opener.","Why don't scientists trust atoms? Because they make up everything.","What did the left eye say to the right eye? Between you and me, something smells.","Why was the calendar nervous? Its days were numbered.","What do you call a fish with no eyes? Fsh.","Why did the belt get arrested? It held up a pair of pants.","What do you call a snowman in summer? A puddle.","Why was the computer cold? It left its Windows open.","What do you call a lazy kangaroo? A pouch potato.","Why did the music teacher need a ladder? To reach the high notes.","How do you organize a space party? You planet.","Why did the barber win the race? He knew a shortcut.","What's brown and sticky? A stick.","Why are fish so smart? Because they live in schools.","What kind of tree fits in your hand? A palm tree.","Why did the teddy bear skip dessert? It was stuffed.","What did the buffalo say to his son when he left? Bison.","Why did the musician get locked out? He left his keys inside.","What do you call a bee that can't make up its mind? A maybe.","Why did the clock get sent to the principal? It kept tocking back.","What do you call a nervous javelin thrower? Shakespeare.","Why did the duck get a job? He had bills to pay.","What do you call a cow during an earthquake? A milkshake.","Why don't seagulls fly over the bay? Because then they'd be bagels.","What do you call a pig that does karate? A pork chop.","Why did the mushroom get invited to every party? Because he was a fungi.","What do you call a sleeping dinosaur? A dino-snore.","Why are frogs so happy? They eat whatever bugs them.","What do you call a rabbit with fleas? Bugs Bunny.","Why did the bee get married? Because he found his honey.","What do you call a deer with no eyes? No eye deer.","What do you call a deer with no eyes and no legs? Still no eye deer.","Why did the cow cross the road? To get to the udder side.","What do you call a cow that plays an instrument? A moo-sician.","What do you call a dog that can tell time? A watch dog.","What do you call a dog on a submarine? A sub-woofer.","Why did the cat sit on the computer? To keep an eye on the mouse.","What do you call a cat that loves bowling? An alley cat.","Why did the frog take the bus to work? His car got toad.","What do you call a crocodile detective? An investi-gator.","What do you call an owl that does magic? Hoodini.","Why did the owl invite his friends over? He didn't want to be owl by himself.","What do you call a sheep with no legs? A cloud.","Why did the sheep cross the road? To get to the baa-ber shop.","What do you call a horse that lives next door? A neigh-bor.","Why did the horse go behind the tree? To change his jockeys.","What do you call a fly without wings? A walk.","What do you call a snail on a ship? A snailor.","Why did the crab never share? Because he was shellfish.","What do you call a fish that practices medicine? A sturgeon.","What do you call a fish that knows how to sing? A tuna fish.","What do you call a fish made of two sodium atoms? 2 Na.","Why are fish bad at basketball? They're afraid of the net.","Why was the fish's report card bad? It was below sea level.","What do you call a bear in the rain? A drizzly bear.","What do you call a bear with no ears? B.","What do polar bears eat for lunch? Ice-burgers.","Why don't elephants use computers? They're afraid of the mouse.","What do you call an elephant that doesn't matter? Irrelephant.","What do you call a group of disorganized cats? A cat-astrophe.","What do you call a line of rabbits hopping backward? A receding hareline.","What do you call a chicken staring at lettuce? Chicken sees a salad.","Why did the chicken cross the playground? To get to the other slide.","What do you call a duck that gets all A's? A wise quacker.","What time does a duck wake up? At the quack of dawn.","What do you call a duck that steals? A robber ducky.","Why did the turkey join the band? It had the drumsticks.","Why did the turkey cross the road twice? To prove it wasn't chicken.","What do you call a moose with no name? Anonymoose.","What do you call a reindeer with bad manners? Rude-olph.","What do you call a rabbit who tells jokes? A funny bunny.","What do you call a rabbit who works at a restaurant? A server hare.","Why did the squirrel swim on its back? To keep its nuts dry.","What do you call a squirrel in a church? Holy nuts.","Why did the spider become a web designer? It was naturally good at it.","What do you call a spider with 20 eyes? A spiiiiiiiiiiiiiiiiider.","Why did the ant dance on the jam jar? It said twist to open.","What do you call an ant that won't go away? Permanent.","What do you call a fashionable lawn statue? A metro-gnome.","Why did the gardener quit? His celery wasn't high enough.","Why was the gardener embarrassed? He wet his plants.","What do you call a gardener's favorite novel? War and Peas.","Why did the lettuce blush? It saw the salad dressing.","Why did the cucumber need a lawyer? It was in a pickle.","What do you call a sad strawberry? A blueberry.","Why did the strawberry cry? Its parents were in a jam.","What do you call a potato wearing glasses? A spec-tater.","What do you call a potato at a football game? A spec-tater.","Why did the potato sit down? It was a couch potato.","Why did the onion get promoted? It had many layers of experience.","What do you call an onion that tells jokes? A pun-ion.","Why did the lemon stop halfway up the hill? It ran out of zest.","What do you call a lemon that helps people? Lemon-aid.","Why was the apple alone? Everyone thought it was a bad apple.","Why did the apple go to school? To become a little sharper.","Why did the pear go to the doctor? It wasn't feeling well-paired.","What do you call two pears? A pair.","Why did the watermelon jump into the lake? It wanted to be a water-melon.","Why was the melon sad? It was feeling melon-choly.","What do you call a fruit that always complains? A wine-grape.","Why did the grape stop in the middle of the road? It ran out of juice.","Why do bananas never get lonely? They hang out in bunches.","Why did the banana split? Because it saw the ice cream.","What did the banana say to the dog? Nothing. Bananas can't talk.","Why did the orange lose the race? It ran out of juice.","Why did the orange wear a tie? It wanted to look a-peel-ing.","What do you call a fake noodle? An impasta.","Why did the pasta go to therapy? It had too many issues to noodle through.","Why did the bread break up with the butter? It needed some space to loaf.","What does bread do on vacation? Loaf around.","Why was the loaf of bread good at jokes? It always had a rye sense of humor.","What do you call a nervous loaf of bread? A basket case.","Why did the cookie cry? Its mom was a wafer too long.","What is a cookie's favorite band? Oreo Speedwagon.","Why did the donut go to the dentist? It needed a filling.","What do you call a donut without a hole? A Danish.","Why did the pancake get arrested? It was caught battering someone.","Why did the waffle go to therapy? It had too many squares to work through.","Why did the egg hide? It was a little chicken.","Why did the egg cross the road? To get to the shell station.","What did the egg say to the frying pan? You crack me up.","Why did the bacon laugh? The egg cracked a yolk.","What do you call a sad cup of coffee? Depresso.","How does Moses make coffee? Hebrews it.","Why did the tea call the police? It got mugged too.","What do you call a tea that's hard to understand? A difficul-tea.","Why did the milk get promoted? It was outstanding in its dairy field.","What do cows read in the morning? The moos-paper.","What do cows do on Friday night? Go to the moo-vies.","What is a cow's favorite holiday? Moo Year's Eve."];
  var SALES_FUEL=["One good conversation can change the whole day.","Make the call before your brain turns it into a group project.","Confidence is built after you start, not before.","The next yes has no idea who told you no five minutes ago.","Do the revenue work first. Busywork will survive.","Your pipeline cannot hear you thinking. Call somebody.","A clear ask beats a perfect speech.","Momentum loves people who move before they feel ready.","The goal today is not perfect. It is productive.","One brave ask can open a door you could not spreadsheet your way into.","Be easy to reach, easy to trust, and hard to forget.","Follow-up is where good intentions become actual business.","If the day feels slow, create some noise.","Do not borrow rejection from a call you have not made yet.","The phone is not heavy. Pick it up.","Your next client may be hiding behind the call you keep skipping.","Make enough good moves and the scoreboard has to notice.","No drama. Next call.","The best time to build pipeline is before you need pipeline.","Ask the question. Then be quiet long enough to hear the answer.","You do not need everyone. You need the right next person.","A quiet inbox is not a strategy.","Do not wait for a better mood. Make a better move.","One focused hour can rescue an entire day.","Sales gets lighter when you stop trying to impress and start trying to help.","Be useful enough that people are glad you called.","The fastest confidence boost is keeping a promise to yourself.","Your calendar is built by conversations you were willing to start.","Stop rehearsing the call. Have the call.","The next conversation deserves fresh energy.","You can be nervous and still sound prepared.","Strong follow-up is a competitive advantage because most people are terrible at it.","Make the next step so clear it feels easy to say yes.","The day can turn around in one conversation.","Nobody remembers the call you almost made.","A warm lead should never have time to get cold.","Do not let a no rent space in the next conversation.","Talk to people. Solve problems. Ask for the business.","A great week is usually ordinary work done with unusual consistency.","The uncomfortable call is often the valuable one.","Your edge can be as simple as doing what you said you would do.","People remember speed, clarity, care, and follow-through.","The market can be weird. Your effort does not have to be.","You are one introduction away from a completely different month.","Do not make silence mean no. Follow up.","The best sales energy is confidence without desperation.","Every open loop needs a next step.","Make money-making moves before email starts acting important.","If you want more opportunity, create more conversations.","Your activity today is building a pipeline you cannot see yet.","Do not leave opportunity sitting in a draft text.","Be persistent enough to be remembered and useful enough to be welcomed.","A strong ask is kinder than a vague hint.","The next breakthrough rarely announces itself before the call.","Today's discipline is next month's breathing room.","If the answer is not yet, keep the relationship alive.","One quality conversation can pay for a whole day of effort.","Nothing changes until somebody starts the conversation.","You do not have to win the month today. Win the next hour.","The best pipeline strategy is still talking to people.","Your future referrals are hiding inside today's follow-up.","Make the call while everyone else is still overthinking it.","A clean next step beats a flawless conversation.","If the pace is off, shrink the problem: who is next?","Ask better questions and selling gets a lot less weird.","Every transaction is an audition for the next referral.","The relationship is not finished when the loan closes.","Do not hope they remember you. Give them a reason to.","The best referral ask is backed by an experience worth referring.","Be the person who makes complicated things feel manageable.","People trust the person who communicates before they have to ask.","Fast and helpful beats perfect and late.","Your reputation is being built in tiny moments all day.","Make people feel taken care of. They remember that.","A real relationship has a next conversation on the calendar.","The easiest person to work with gets remembered.","You are not chasing people. You are creating chances to help them.","If the relationship matters, put a next step on it.","Stay close enough that opportunity does not have to hunt for you.","Trust compounds when follow-through becomes predictable.","Good service earns the right to ask for more business.","Be the lender they think of before they need a lender.","A name in a database is not a relationship. Start the conversation.","Relationships grow where attention goes.","The best pitch is being consistently good to work with.","Make their client experience make you easy to refer.","When you create relief, people remember who created it.","Communication is part of the product.","No surprises is a sales strategy.","Be calm, be clear, be useful.","Clarity moves people faster than pressure.","The strongest close can be one simple question.","Say what you want the next step to be.","If you earned the ask, make the ask.","Do not apologize for wanting to grow a relationship you serve well.","Silence after the ask is not an emergency.","Courage gets easier with reps.","Your comfort zone has never funded a loan.","Pressure feels smaller when the process is clear.","Big months are built on very ordinary Tuesdays.","Consistency is boring right up until it starts winning.","Bring urgency, not panic.","Compete hard. Stay human.","Hungry and helpful is a dangerous combination.","Raise the standard by living it.","The team gets better when everybody owns the next move.","Bring solutions, not just observations.","Do not confuse motion with progress.","If a number bothers you, give it new behavior to measure.","Data is useful when it changes the next action.","The scoreboard is information, not a personality test.","If the number is low, action is the answer.","Track the behavior. Learn from the result. Adjust fast.","Meetings are good. Movement is better.","The point is not to look busy. The point is to move business.","A goal becomes real when today's action is obvious.","Simple. Clear. Repeatable. That wins.","One more conversation can completely change today's scoreboard.","Dial first. Feel ready second.","Your pipeline does not need perfect. It needs motion.","Every no clears room for a yes you have not met yet.","Do not let 10:00 a.m. decide what kind of day this is.","Reset whenever you need to. The next move still counts.","A rough morning does not get custody of the afternoon.","Finish strong. Wins do not care what time they happen.","Protect your prime hours from fake productivity.","Do the thing that can create business before the thing that merely looks productive.","The call is only awkward until somebody answers.","Your job is not to control the yes. Earn the conversation.","People can hear confidence. They can also hear care. Bring both.","Keep showing up long enough to become the obvious choice.","The person who follows through gets remembered.","Be so reliable that referring you feels safe.","Opportunity likes people who answer quickly.","Today's follow-up is tomorrow's pipeline maintenance.","Do not make a good lead chase you.","Stay curious longer than the average salesperson.","Ask one better question before you give one more answer.","The right question can do more than the perfect pitch.","Create value before asking for value back.","The best closers listen hard and ask clearly.","You are not behind forever. You are one focused block from changing the pace.","Do not count the calls you avoided. Make the next one count.","A full pipeline is built when nobody is clapping.","The next yes is not impressed by the last no.","Your future business is being built in conversations that feel ordinary today.","Show up. Follow through. Ask again when it makes sense.","The work works when you work it.","Be the reason somebody says, Call them. They are great.","If you can make the next step easier, you just made yourself more valuable.","People refer confidence they can trust.","Make today expensive to ignore.","Win the next conversation, not the imaginary argument in your head.","Your pipeline wants action, not a motivational speech. Conveniently, so do you.","Do not spend twenty minutes preparing for a two-minute call.","One call. One ask. One follow-up. Repeat.","The boring stuff becomes very exciting when it starts closing.","There is no secret move hiding after the follow-up. The follow-up is the move.","If you know the next right action, you know enough to start.","The best days are often rescued by the call you almost skipped.","Do not carry yesterday into today's first dial.","New day. New people. New chances to win.","Your next opportunity does not care how many times you got ignored yesterday.","Make it easy to trust you, remember you, and refer you.","Your energy should say: I know I can help, and I am here to do it.","Be memorable for the follow-through, not the follow-up count.","When in doubt, move the relationship forward.","The best time to ask for business is after you have created value.","Do not wait for momentum to arrive. Give it an address.","A good sales day is built one deliberate conversation at a time.","The work is simple. The courage is the skill.","Every call is a fresh room. Walk into it clean.","You are allowed to have a bad call. You are not required to have a bad day.","A little courage plus a little consistency is a lot of pipeline.","You can turn the week around before lunch.","Do not negotiate against yourself before anyone answers.","The opportunity you want may be one follow-up deeper.","Be the person who stays useful after the first conversation.","The strongest pipeline is full of clear next actions.","Your CRM is not a museum. Move something.","A relationship gets warmer when somebody actually reaches out.","Sales is not magic. It is courage with a calendar.","Make the brave move while it is still small.","Do not chase perfect timing. Create a useful reason to call.","If you are waiting for a sign, this is obnoxiously it.","You have enough information for the next move.","Keep the standard high even when the response rate is low.","Talk to enough people and the market starts talking back.","The next person may be exactly the conversation you needed today.","Your follow-up should make people feel remembered, not chased.","The goal is not more noise. It is more meaningful conversations.","The best business feels like trust moving in both directions.","One small move can create a very large month.","A strong finish makes tomorrow easier.","Leave the pipeline better than you found it.","There is still time to make today count.","Make one move your future self will be glad you made."];
  // Daily indexing cycles through the full deck before repeating.
  var dailyEpoch=Math.floor(dayStart.getTime()/86400000);
  var jokeIndex=Math.abs(dailyEpoch)%DAILY_LAUGHS.length;
  var fuelIndex=Math.abs(dailyEpoch)%SALES_FUEL.length;
  var DAILY_LAUGH=DAILY_LAUGHS[jokeIndex];
  var QUOTE='“'+SALES_FUEL[fuelIndex]+'”';
  var QUOTE_AUTHOR="";
  var headlines=[];
  var allHit=LPS.every(function(lp){return callsLogged[lp]>=WEEKLY_TARGET;});
  if(allHit)headlines.push("🔥 Full team hit their call targets this week!");
  var ahead=LPS.filter(function(lp){return callsLogged[lp]>=WEEKLY_TARGET;});
  if(ahead.length===1&&!allHit)headlines.push(ahead[0]+" hit 15/15 this week — who's next?");
  if(ahead.length>1&&!allHit)headlines.push(ahead.join(", ")+" finished calls — keep pushing!");
  if(leadsToday>0)headlines.push(leadsToday+" lead"+(leadsToday>1?"s":"")+" came in today — follow up!");
  var behind=LPS.filter(function(lp){return callsLogged[lp]<Math.round(WEEKLY_TARGET*paceFraction*.65);});
  if(behind.length&&paceFraction>.3)headlines.push(behind.join(", ")+" — time to pick up the pace");
  if(!headlines.length)headlines.push("Team is moving — keep making those calls");
  var headline=headlines[Math.floor(now.getSeconds()/10)%headlines.length];

  var todayFmt=now.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});
  var h="";

  // Hero — light card matching the rest of the page, not a leftover dark gradient
  var allLPsDone=LPS.every(function(lp){return callsLogged[lp]>=WEEKLY_TARGET;});
  h+='<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px 22px;margin-bottom:1rem">';
  h+='<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:14px">';
  h+='<div><div style="color:var(--text-3);font-size:9px;text-transform:uppercase;letter-spacing:.14em;font-family:\'Geist\',\'Inter\',sans-serif;margin-bottom:3px">NFM Lending Ohio</div>';
  h+='<div style="color:var(--text);font-size:16px;font-weight:700">'+todayFmt+'</div></div>';
  h+='<div style="background:#EEF1F6;border-radius:8px;padding:7px 12px;font-size:14px;font-weight:600;color:#3D4E68">'+headline+'</div>';
  h+='</div>';
  h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">'
    +'<div style="background:#F3F9FB;border:1px solid #DCE7EC;border-radius:9px;padding:9px 11px"><div style="font-size:9.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#007FA4;margin-bottom:3px">Quote of the day</div><div style="font-size:11.5px;color:var(--text-2);font-weight:600;line-height:1.45">'+QUOTE+'</div></div>'
    +'<div style="background:#FAF7F2;border:1px solid #E9DFD3;border-radius:9px;padding:9px 11px"><div style="font-size:9.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#8C7355;margin-bottom:3px">Dad joke of the day</div><div style="font-size:11.5px;color:var(--text-2);line-height:1.45">'+DAILY_LAUGH+'</div></div>'
    +'</div>';
  h+='<div style="display:flex;gap:22px;flex-wrap:wrap">';
  [{v:totalCallsWTD+" / "+(LPS.length*WEEKLY_TARGET),l:"Team outreach WTD",c:"#3D4E68"},
   {v:leadsToday,l:"Leads today",c:"#3E8E5A"},
   {v:leadsWTD,l:"Leads WTD",c:"var(--text-2)"},
   {v:leadsMTD,l:"Leads MTD",c:"var(--text-2)"}
  ].forEach(function(s){
    h+='<div><div style="color:'+s.c+';font-size:22px;font-weight:700;font-family:\'Geist\',\'Inter\',sans-serif;line-height:1">'+s.v+'</div>';
    h+='<div style="color:var(--text-3);font-size:9px;text-transform:uppercase;letter-spacing:.1em;margin-top:3px">'+s.l+'</div></div>';
  });
  h+='</div></div>';

  // Cards grid
  // ── SCOREBOARD ROWS (no grid, works at any width) ──
  h+='<div style="width:100%;margin-bottom:1rem">';

  // ── LP2 rows ──
  // Isaak is LP1, not a sixth LP2. Keep him in shared data/ownership and team production totals,
  // but render him only once in his dedicated LP1 card below.
  LPS.filter(function(lp){return lp!=="Isaak";}).forEach(function(lp){
    var called=callsLogged[lp]||0;
    var target=WEEKLY_TARGET;
    var paceTarget=Math.round(target*paceFraction);
    var pct=Math.round(called/target*100);
    var lpColor='#3D4E68';
    var leadsW=lpLeadsWTD[lp]||0;
    var leadsT=lpLeadsToday[lp]||0;
    var scData=snapScData[lp]||{};
    var rltrTalks=scTotal(scData,'rltr_talks');
    var referredLeads=scTotal(scData,'referred_leads');
    var apps=scTotal(scData,'apps_1003');
    var preApps=scTotal(scData,'pre_approvals');
    var contracts=scTotal(scData,'contracts');
    var missedLastWeek=getLpMissedLastWeek(lp).filter(function(a){return isActive(a);}).length;
    var status,sc;
    if(called>=target){status='Week complete!';sc='#3E8E5A';}
    else if(called>=paceTarget){status='On pace';sc='#3E8E5A';}
    else if(called>=Math.round(paceTarget*.7)){status='Almost there';sc='#B8842B';}
    else{status='Pick it up';sc='#B54B42';}
    var barW=Math.min(pct,100);
    h+='<div onclick="goToLP(\''+lp+'\',)" style="cursor:pointer;border-left:4px solid '+lpColor+';padding:10px 14px;margin-bottom:6px;border-radius:0 6px 6px 0;background:var(--surface)" onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'var(--surface)\'">';
    h+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap">';
    h+='<div style="min-width:72px"><span style="font-size:14px;font-weight:600;color:'+lpColor+'">'+lp+'</span> <span style="font-size:9px;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em">LP2</span></div>';
    h+='<span style="font-family:\'Geist\',\'Inter\',sans-serif;font-size:24px;font-weight:700;color:var(--text)">'+called+'</span>';
    h+='<span style="font-size:11px;color:var(--text-3)">/ '+target+' calls this week</span>';
    h+='<span style="font-family:\'Geist\',\'Inter\',sans-serif;font-size:16px;font-weight:700;color:'+lpColor+'">'+pct+'%</span>';
    h+='<span style="font-size:11px;color:'+sc+';font-weight:500">'+status+'</span>';
    if(missedLastWeek>0)h+='<span class="carryover-tag" style="cursor:pointer" title="Click to see which agents weren\'t called last week" onclick="event.stopPropagation();goToLP(\''+lp+'\',true)">'+missedLastWeek+' carried over from last week &#8250;</span>';
    h+='<span style="margin-left:auto;font-size:10px;color:var(--text-3)">Velocify: <b style="color:'+(leadsW?'#3E8E5A':'var(--text-3)')+'">'+leadsW+' WTD</b> · '+leadsT+' today · <a style="color:var(--accent)" onclick="event.stopPropagation();goToLP(\''+lp+'\')">open ↗</a></span>';
    h+='</div>';
    h+='<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">';
    h+='<div style="flex:1;min-width:120px"><div style="height:3px;background:rgba(0,0,0,.07);border-radius:2px;overflow:hidden"><div style="height:100%;width:'+barW+'%;background:'+lpColor+'"></div></div></div>';
    var mets=[['Talk\'s',rltrTalks,10],['Leads',referredLeads,16],['1003\'s',apps,13],['Pre-apps',preApps,6],['Contracts',contracts,3]];
    mets.forEach(function(m){
      var mc=m[1]>=m[2]?'#3E8E5A':m[1]>0?'#B8842B':'var(--text-3)';
      h+='<div style="text-align:center;min-width:44px"><div style="font-size:12px;font-weight:600;color:'+mc+';font-family:\'Geist\',\'Inter\',sans-serif">'+m[1]+'<span style="font-size:9px;color:var(--text-3);">/'+m[2]+'</span></div><div style="font-size:8px;color:var(--text-3);text-transform:uppercase">'+m[0]+'</div></div>';
    });
    h+='</div>';
    h+='</div>';
  });

  h+='<div style="height:1px;background:var(--border);margin:10px 0 8px"></div>';

  // ── Isaak row (LP1) ──
// Isaak card
  var isaakData2=snapScData["Isaak"]||{};
  var isaakApps=scTotal(isaakData2,"apps_1003");
  var isaakPreApps=scTotal(isaakData2,"pre_approvals");
  var isaakContracts=scTotal(isaakData2,"contracts");
  var isaakRCalls=scTotal(isaakData2,"realtor_calls");
  var isaakMeetings=scTotal(isaakData2,"meetings");
  // Also use lpHistoryCallCounts as fallback
  var isaakTarget=100;
  var isaakPct=Math.min(Math.round(isaakRCalls/isaakTarget*100),100);
  var isaakPaceT=Math.round(isaakTarget*paceFraction);
  var iSt,iSc,iSb;

  var isaakPct=Math.min(Math.round(isaakRCalls/100*100),100);
  var isaakStatus,isaakSc;
  var isaakPace=Math.round(100*paceFraction);
  if(isaakRCalls>=100){isaakStatus='Complete!';isaakSc='#3E8E5A';}
  else if(isaakRCalls>=isaakPace){isaakStatus='On pace';isaakSc='#3E8E5A';}
  else if(isaakRCalls>=Math.round(isaakPace*.7)){isaakStatus='Close';isaakSc='#B8842B';}
  else{isaakStatus='Behind pace';isaakSc='#B54B42';}
  h+='<div style="border-left:4px solid #3D4E68;padding:10px 14px;margin-bottom:6px;border-radius:0 6px 6px 0;background:var(--surface)">';
  h+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap">';
  h+='<div style="min-width:128px"><span style="font-size:14px;font-weight:600;color:#3D4E68">Isaak</span> <span style="font-size:9px;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em">LP1 · APP SUPPORT</span></div>';
  h+='<span style="font-family:\'Geist\',\'Inter\',sans-serif;font-size:24px;font-weight:700;color:var(--text)">'+isaakRCalls+'</span>';
  h+='<span style="font-size:11px;color:var(--text-3)">/ 100 calls this week</span>';
  h+='<span style="font-family:\'Geist\',\'Inter\',sans-serif;font-size:16px;font-weight:700;color:#3D4E68">'+isaakPct+'%</span>';
  h+='<span style="font-size:11px;color:'+isaakSc+';font-weight:500">'+isaakStatus+'</span>';
  h+='</div>';
  h+='<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">';
  h+='<div style="flex:1;min-width:120px"><div style="height:3px;background:rgba(0,0,0,.07);border-radius:2px;overflow:hidden"><div style="height:100%;width:'+isaakPct+'%;background:#3D4E68"></div></div></div>';
  h+='<div style="text-align:center;min-width:44px"><div style="font-size:12px;font-weight:600;font-family:\'Geist\',\'Inter\',sans-serif;color:'+(isaakRCalls>=100?'#3E8E5A':isaakRCalls>0?'#B8842B':'var(--text-3)')+'">'+isaakRCalls+'<span style="font-size:9px;color:var(--text-3)">/100</span></div><div style="font-size:8px;color:var(--text-3);text-transform:uppercase">Calls</div></div>';
  h+='<div style="text-align:center;min-width:44px"><div style="font-size:12px;font-weight:600;font-family:\'Geist\',\'Inter\',sans-serif;color:'+(isaakMeetings>=10?'#3E8E5A':isaakMeetings>0?'#B8842B':'var(--text-3)')+'">'+isaakMeetings+'<span style="font-size:9px;color:var(--text-3)">/10</span></div><div style="font-size:8px;color:var(--text-3);text-transform:uppercase">Meetings</div></div>';
  h+='<div style="text-align:center;min-width:44px"><div style="font-size:12px;font-weight:600;font-family:\'Geist\',\'Inter\',sans-serif;color:'+(isaakApps>=10?'#3E8E5A':isaakApps>0?'#B8842B':'var(--text-3)')+'">'+isaakApps+'<span style="font-size:9px;color:var(--text-3)">/10</span></div><div style="font-size:8px;color:var(--text-3);text-transform:uppercase">1003\'s</div></div>';
  h+='<div style="text-align:center;min-width:48px"><div style="font-size:12px;font-weight:600;font-family:\'Geist\',\'Inter\',sans-serif;color:'+(isaakPreApps>0?'#3E8E5A':'var(--text-3)')+'">'+isaakPreApps+'</div><div style="font-size:8px;color:var(--text-3);text-transform:uppercase">Pre-apps</div></div>';
  h+='<div style="text-align:center;min-width:48px"><div style="font-size:12px;font-weight:600;font-family:\'Geist\',\'Inter\',sans-serif;color:'+(isaakContracts>0?'#3E8E5A':'var(--text-3)')+'">'+isaakContracts+'</div><div style="font-size:8px;color:var(--text-3);text-transform:uppercase">Contracts</div></div>';
  h+='</div>';
  h+='</div>';

  h+='<div style="height:1px;background:var(--border);margin:10px 0 8px"></div>';

  // ── Amanda row (RM) ──
// Amanda card
  var amData=snapScData["Amanda"]||{};
  // Amanda activity counts — today / WTD / MTD / YTD from rmActsCache
  var amCache=window.rmActsCache;
  var amActs=amCache&&amCache.acts?amCache.acts:(window.rmFeedCache&&window.rmFeedCache.week?window.rmFeedCache.week:[]);
  var amTodayStr=amCache&&amCache.todayStr?amCache.todayStr:localDateStr(now);
  var amWeekObj=amCache&&amCache.week?amCache.week:{start:"",end:""};
  var amMonthStart2=amCache&&amCache.monthStart?amCache.monthStart:now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-01";
  var amYearStart=now.getFullYear()+"-01-01";
  var amTodayActs=amActs.filter(function(a){return a.act_date===amTodayStr;});
  var amWeekActs=amActs.filter(function(a){return a.act_date>=amWeekObj.start&&a.act_date<=amWeekObj.end;});
  var amMonthActs=amActs.filter(function(a){return a.act_date>=amMonthStart2;});
  var amYearActs=amActs.filter(function(a){return a.act_date>=amYearStart;});
  var amTotalToday = amCnt(amTodayActs,"New Realtor Meeting")+amCnt(amTodayActs,"Cold Calls")+amCnt(amTodayActs,"Break Breads")+amCntTalkTo(amTodayActs)+amCnt(amTodayActs,"Realtor Buddy Referral Ask");
  var amTotalMTD = amCnt(amMonthActs,"New Realtor Meeting")+amCnt(amMonthActs,"Cold Calls")+amCnt(amMonthActs,"Break Breads")+amCntTalkTo(amMonthActs)+amCnt(amMonthActs,"Realtor Buddy Referral Ask");
  var amTotalYTD=amYearActs.length;
  var amMeetings=amCnt(amMonthActs,"New Realtor Meeting");
  var amColdCalls=amCnt(amMonthActs,"Cold Calls");
  var amBreakBreads=amCnt(amMonthActs,"Break Breads");
  var TALKTO_TYPES=["Agent Talk-to","New Agent Follow-up","Active Agent Talk-to","Active Agent Check-in","Reconnect Outreach","CTC Call","Market Update","Market Update Call","Closed Deal Thank You","Birthday Outreach","Holiday Outreach","Agent Appreciation","Co-Marketing Discussion","Sent Referral","Sent Market Report","Recruiting Conversation"];
  var amTalkTos=amCntTalkTo(amMonthActs);
  var amBuddyAsks=amCnt(amMonthActs,"Realtor Buddy Referral Ask");
  // amTotalWTD must be the SUM of the 5 tracked goal categories for the week —
  // not a raw count of every logged activity row. Activity types outside
  // those 5 categories (e.g. "Co-hosted Event") were previously inflating
  // this number well past what Amanda's own tool shows, since her tool only
  // ever sums these same 5 categories.
  var amTotalWTD = amCnt(amWeekActs,"New Realtor Meeting")
    + amCnt(amWeekActs,"Cold Calls")
    + amCnt(amWeekActs,"Break Breads")
    + amCntTalkTo(amWeekActs)
    + amCnt(amWeekActs,"Realtor Buddy Referral Ask");
  var amWeeklyGoal=238; // 125 cold calls + 100 talk-tos + 5 meetings + 5 break breads + 3 buddy asks
  var amDailyTotalGoal=48; // 25 cold calls + 20 talk-tos + 1 meeting + 1 break bread + 1 buddy ask
  var amTotalGoal=852;
  var amPaceT=Math.round(amWeeklyGoal*paceFraction);
  var amPctOfGoal=amWeeklyGoal>0?Math.min(Math.round(amTotalWTD/amWeeklyGoal*100),100):0;
  // Amanda status badge
  if(amPctOfGoal>=100){aSt="Week complete!";aSc="#3E8E5A";aSb="#EAF5EE";}
  else if(amPctOfGoal>=paceFraction*100*0.85){aSt="On pace";aSc="#3D4E68";aSb="#EEF1F6";}
  else if(amPctOfGoal>=paceFraction*100*0.65){aSt="Almost there";aSc="#B8842B";aSb="#FBF3E5";}
  else{aSt="Pick it up";aSc="#B54B42";aSb="#FBEBE9";}

  h+='<div style="border-left:4px solid #3D4E68;padding:10px 14px;border-radius:0 6px 6px 0;background:var(--surface)">';
  h+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap">';
  h+='<div style="min-width:72px"><span style="font-size:14px;font-weight:600;color:#3D4E68">Amanda</span><br><span style="font-size:9px;color:var(--text-3);text-transform:uppercase;letter-spacing:.04em">RM</span></div>';
  h+='<span style="font-family:\'Geist\',\'Inter\',sans-serif;font-size:24px;font-weight:700;color:var(--text)">'+amTotalWTD+'</span>';
  h+='<span style="font-size:11px;color:var(--text-3)">/ '+amWeeklyGoal+' this week</span>';
  h+='<span style="font-family:\'Geist\',\'Inter\',sans-serif;font-size:16px;font-weight:700;color:#3D4E68">'+amPctOfGoal+'%</span>';
  h+='<span style="font-size:11px;color:'+aSc+';font-weight:500">'+aSt+'</span>';
  h+='<span style="margin-left:auto;font-size:10px;color:var(--text-3)">Today: '+amTotalToday+' · MTD: '+amTotalMTD+'</span>';
  h+='</div>';
  h+='<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">';
  h+='<div style="flex:1;min-width:120px"><div style="height:3px;background:rgba(0,0,0,.07);border-radius:2px;overflow:hidden"><div style="height:100%;width:'+amPctOfGoal+'%;background:#3D4E68"></div></div></div>';
  [{type:"New Realtor Meeting",daily:1,weekly:5,label:"Mtgs"},{type:"Cold Calls",daily:25,weekly:125,label:"Cold Calls"},{type:"Break Breads",daily:1,weekly:5,label:"Breads"},{type:"__talkto__",daily:20,weekly:100,label:"Talk-to\'s"},{type:"Realtor Buddy Referral Ask",daily:1,weekly:3,label:"Buddy"}].forEach(function(m){
    var td=m.type==="__talkto__"?amCntTalkTo(amTodayActs):amCnt(amTodayActs,m.type);
    var tw=m.type==="__talkto__"?amCntTalkTo(amWeekActs):amCnt(amWeekActs,m.type);
    var dc=td>=m.daily?'#3E8E5A':'var(--text-3)';
    var wc=tw>=m.weekly?'#3E8E5A':tw>0?'#B8842B':'var(--text-3)';
    h+='<div style="text-align:center;min-width:44px"><div style="font-size:12px;font-weight:600;color:'+dc+';font-family:\'Geist\',\'Inter\',sans-serif">'+td+'<span style="font-size:9px;color:var(--text-3)">/'+m.daily+'</span></div><div style="font-size:10px;font-weight:500;color:'+wc+';font-family:\'Geist\',\'Inter\',sans-serif">'+tw+'<span style="font-size:8px;color:var(--text-3)">/'+m.weekly+'</span></div><div style="font-size:8px;color:var(--text-3);text-transform:uppercase">'+m.label+'</div></div>';
  });
  h+='<span style="margin-left:auto;font-size:10px"><a style="color:var(--accent);cursor:pointer" onclick="openRmView(document.querySelector(\'.wb-RM\'))">open RM ↗</a></span>';
  h+='</div>';
  h+='</div>';

  h+='</div>'; // close scoreboard

  // Footer
  var nextR=new Date(now);nextR.setHours(18,0,0,0);
  if(now>=nextR)nextR.setDate(nextR.getDate()+1);
  var hrs=Math.ceil((nextR-now)/3600000);
  h+='<div style="text-align:center;padding:8px;font-size:10px;color:var(--text-3);font-family:\'Geist\',\'Inter\',sans-serif">Live data synced on open/refresh · rendered '+now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',second:'2-digit'})+'</div>';

  el.innerHTML=h;
  clearTimeout(window._snapshotTimer);
  var ms=nextR-now;
  if(ms>0&&ms<86400000)window._snapshotTimer=setTimeout(buildSnapshot,ms);
}




function renderTeamStreak(){
  var el=document.getElementById("d-team-streak-section");
  if(!el)return;
  // Check if all LPs hit their target last week
  var allHit=true;
  var results=[];
  LPS.forEach(function(lp){
    var incomplete=getLpIncompleteFromLastWeek(lp);
    results.push({lp:lp,hit:incomplete===0});
    if(incomplete>0)allHit=false;
  });
  var hitCount=results.filter(function(r){return r.hit;}).length;

  if(hitCount===0){el.innerHTML="";return;}

  if(allHit){
    el.innerHTML='<div style="background:linear-gradient(135deg,#1a2744,#0D7377);border-radius:var(--radius-md);padding:12px 16px;display:flex;align-items:center;gap:12px">'
      +'<span style="font-size:24px">🔥</span>'
      +'<div><div style="color:#fff;font-size:13px;font-weight:700">Full team hit 15/15 last week!</div>'
      +'<div style="color:rgba(255,255,255,.7);font-size:11px;margin-top:2px">Every LP completed their calls. Keep the momentum going this week.</div></div>'
      +'</div>';
  } else {
    var hitNames=results.filter(function(r){return r.hit;}).map(function(r){return r.lp;}).join(", ");
    el.innerHTML='<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 14px;display:flex;align-items:center;gap:10px;box-shadow:var(--shadow-sm)">'
      +'<span style="font-size:18px">🔥</span>'
      +'<div style="font-size:12px;color:var(--text-2)"><b style="color:var(--text)">'+hitNames+'</b> hit 15/15 last week. '+(5-hitCount)+' LP'+(5-hitCount>1?'s':'')+' missed &#8212; let\'s get everyone there this week.</div>'
      +'</div>';
  }
}

function renderDaniel(){
  renderTeamStreak();
  renderCarryoverAlerts();
  renderNoteQuality();
  renderAlerts();
  renderAllClear();
  loadLeadPipeline();
  renderGrowthScoreboard();
  renderVelocifyLeaderboard();
  var bdayEl=document.getElementById("daniel-bday-list");
  if(bdayEl){
    var allBdays=getBirthdayAgentsThisWeek();
    if(allBdays.length){
      bdayEl.innerHTML=allBdays.map(function(b){
        var ag=agents.find(function(a){return a[0]===b.name;});var lp=ag?ag[2]:"";
        return'<div class="alert-item"><span class="adot" style="background:#E91E63"></span><span style="font-weight:600;flex:1">'+b.name+'</span><span style="font-size:12px;color:#888">'+b.birthday+'</span><span>'+rmOwnerBadge(b.name)+'</span><span class="lp-tag lp-tag-'+lp+'">'+lp+'</span><span style="font-size:11px;color:#880E4F">Reach out this week!</span></div>';
      }).join("");
    } else {
      bdayEl.innerHTML='<div style="font-size:13px;color:#aaa;padding:8px 0">🎂 No birthdays this week. Tap Edit on any agent card to add one.</div>';
    }
  }
  renderLeaderboard();
  var flp=document.getElementById("d-lp").value,flv=document.getElementById("d-lvl").value;
  var frm=document.getElementById("d-rm")?document.getElementById("d-rm").value:"";
  var fst=document.getElementById("d-status").value,q=document.getElementById("d-q").value.toLowerCase();
  var gh="";
  LPS.forEach(function(lp){
    var done=getLpCallsThisWeek(lp),pct=getLpPctThisWeek(lp);
    var all=agents.filter(function(a){return a[2]===lp;}),ic=all.filter(function(a){return!isActive(a);}).length;
    var pc=all.filter(function(a){return isPriority(a)&&isActive(a);}).length;
    var col=pct===100?"#43A047":pct>50?"#FB8C00":"#E53935";
    gh+='<div class="d-card" style="cursor:pointer" onclick="goToLP(\''+lp+'\')"><div class="d-name"><span style="width:10px;height:10px;border-radius:50%;background:'+LP_COLORS[lp]+';display:inline-block;flex-shrink:0"></span><span class="lp-c-'+lp+'">'+lp+'</span><span style="font-size:9px;color:var(--text-3);margin-left:auto">tap to open ↗</span></div>';
    gh+='<div class="d-pct" style="color:'+col+'">'+pct+'%</div>';
    gh+='<div class="d-bar-track"><div class="d-bar-fill bar-'+lp+'" style="width:'+pct+'%"></div></div>';
    gh+='<div class="d-meta"><span>'+done+"/"+WEEKLY_TARGET+' this week</span><span>'+all.length+' agents</span></div>';
    if(pc)gh+='<div style="font-size:11px;color:#C62828;margin-top:4px">'+pc+' priority</div>';
    if(ic)gh+='<div style="font-size:11px;color:#E65100;margin-top:2px">'+ic+' inactive</div>';
    gh+='</div>';
  });
  var gridEl=document.getElementById("d-grid");
  if(gridEl)gridEl.innerHTML=gh;
  var list=agents.filter(function(a){return a[2]&&a[2]!=="Unassigned";});
  if(flp)list=list.filter(function(a){return a[2]===flp;});
  if(frm)list=list.filter(function(a){var o=getRmOwner(a[0])||"Unassigned";return o===frm;});
  if(flv)list=list.filter(function(a){return a[1]===flv;});
  if(fst==="active")list=list.filter(isActive);
  if(fst==="inactive")list=list.filter(function(a){return!isActive(a);});
  if(q)list=list.filter(function(a){return a[0].toLowerCase().indexOf(q)>=0;});
  list.sort(function(a,b){if(isPriority(a)&&!isPriority(b))return -1;if(!isPriority(a)&&isPriority(b))return 1;return(lpDays(b[0])||9999)-(lpDays(a[0])||9999);});
  document.getElementById("d-tbody").innerHTML=list.map(function(a){
    var act=isActive(a),ds=effectiveDays(a),mr=mostRecent(a),cal=calledThisWeek(a[0]),pri=isPriority(a);
    var log=callLogs[a[0]],notePreview=log&&log.note?'<div style="font-size:11px;color:#888;margin-top:2px;font-style:italic">'+log.note+'</div>':"";
    var dsc=ds===null?"color:#E53935":ds>=14?"color:#FB8C00":"color:#43A047";
    return'<tr'+(pri?' style="background:#FFFAFA"':'')+'>'+
      '<td style="font-weight:600">'+displayName(a[0])+(pri?'<span class="priority-tag" style="margin-left:5px">PRIORITY</span>':"")+notePreview+'</td>'+
      '<td><span class="badge badge-'+a[1].toLowerCase()+'">'+a[1]+'</span></td>'+
      '<td>'+rmOwnerBadge(a[0])+'</td>'+
      '<td><span class="lp-tag lp-tag-'+a[2]+'">'+a[2]+'</span></td>'+
      '<td>'+(act?'<span style="color:#43A047;font-size:12px">Active</span>':'<span class="badge badge-inactive">Inactive</span>')+'</td>'+
      '<td><button class="btn btn-sm" onclick="openLpContactModal(\''+a[0].replace(/'/g,"\\'")+'\''+')" style="font-size:11px">View/Edit</button></td>'+
      '<td style="font-size:12px">'+(function(){
        var lastCall=agentLastCall[a[0]]||null;
        if(!lastCall)return '<span style="color:#E53935">Never called</span>';
        var d=new Date(lastCall+"T12:00:00");
        var days=Math.floor((TODAY-d)/86400000);
        var dateStr=d.toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"2-digit"});
        var color=days>=60?"#E53935":days>=30?"#FB8C00":"#43A047";
        return '<span style="color:'+color+';font-weight:600">'+dateStr+'</span><br><span style="font-size:10px;color:#94a3b8">'+days+'d ago</span>';
      }())+'</td>'+
      '<td style="font-size:12px">'+(function(){
        var mrt=mostRecentWithType(a);
        if(!mrt)return '<span style="color:#ccc">--</span>';
        var d=new Date(mrt.date+"T12:00:00");
        var days=Math.floor((TODAY-d)/86400000);
        var dateStr=d.toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"2-digit"});
        var color=days>=90?"#E53935":days>=45?"#FB8C00":"#43A047";
        return '<span style="color:'+color+';font-weight:600">'+dateStr+'</span><br>'
          +'<span style="font-size:10px;color:#94a3b8">'+mrt.icon+" "+mrt.label+'</span>';
      }())+'</td>'+
      '<td style="text-align:center">'+(cal?'<b style="color:#43A047">Yes</b>':'<span style="color:#ccc">-</span>')+'</td></tr>';
  }).join("");
}

function renderRmNurtureAdmin(){
  var el=document.getElementById("lp-nurture-admin-list"),count=document.getElementById("lp-nurture-count-label");if(!el)return;
  var rows=[];ctNurtureRosterNames.forEach(function(k){var a=(agents||[]).find(function(x){return assignmentKey(x[0])===k;});var m=ctNurtureRosterMeta[k]||{};rows.push({name:a?a[0]:k,lp:a&&a[2]&&a[2]!=="null"?a[2]:"Unassigned",reason:m.reason||"RM-directed light-touch relationship",next:m.next||""});});
  rows.sort(function(a,b){return (a.next||"9999").localeCompare(b.next||"9999")||a.name.localeCompare(b.name);});
  if(count)count.textContent="- "+rows.length+" relationship"+(rows.length!==1?"s":"");
  el.innerHTML=rows.length?rows.map(function(r){return '<div class="alert-item"><span style="font-weight:650;flex:1">'+displayName(r.name)+'</span><span class="lp-tag lp-tag-'+r.lp+'">'+r.lp+'</span><span style="background:#FFF2D6;color:#8A5A00;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">RM NURTURE</span><span style="font-size:11px;color:#666">'+r.reason+(r.next?' · RM check-in '+r.next:'')+'</span></div>';}).join(""):'<div style="font-size:12px;color:#aaa">No RM Nurture relationships.</div>';
}

function renderAdmin(){
  renderReassign();renderRemoveList();renderCoMktList();renderRmNurtureAdmin();
  var inactive=agents.filter(function(a){return ctRosterEligible(a)&&!isActive(a);});
  document.getElementById("inactive-count-label").textContent="- "+inactive.length+" agents";
  document.getElementById("inactive-list").innerHTML=inactive.length?inactive.map(function(a){var lp=(a[2]&&a[2]!=="null"&&a[2]!=="undefined")?a[2]:"Unassigned";return'<div class="alert-item"><span class="adot adot-amber"></span><span style="font-weight:600;flex:1">'+displayName(a[0])+'</span><span class="badge badge-'+a[1].toLowerCase()+'">'+a[1]+'</span>'+rmOwnerBadge(a[0])+'<span class="lp-tag lp-tag-'+lp+'">'+lp+'</span><span style="font-size:11px;color:#888">'+(mostRecent(a)?"Last: "+fmt(mostRecent(a)):"No activity")+'</span><button class="btn btn-sm btn-success" data-name="'+a[0]+'" onclick="reactivate(this)">Reactivate</button></div>';}).join(""):'<div style="font-size:13px;color:#888">No inactive agents!</div>';
}

function renderReassign(){
  var tbody=document.getElementById("admin-tbody");
  if(!tbody)return;
  var q=(document.getElementById("reassign-q")?.value||"").toLowerCase();
  var flp=document.getElementById("reassign-filter-lp")?.value||"";
  var frm=document.getElementById("reassign-filter-rm")?.value||"";
  tbody.innerHTML='<tr><td colspan="8" style="padding:18px;text-align:center;color:var(--text-3)">Loading live assignments...</td></tr>';
  Promise.all([
    sbFetch("GET","agent_profiles?select=agent_name,tier,relationship_status,lp_outreach_status,nurture_reason,next_rm_followup&limit=5000").catch(function(){return sbFetch("GET","agent_profiles?select=agent_name,tier,relationship_status&limit=5000").catch(function(){return sbFetch("GET","agent_profiles?select=agent_name,tier&limit=5000").catch(function(){return[];});});}),
    sbFetch("GET","agent_assignments?select=agent_name,lp,rm,priority,level&limit=5000").catch(function(){return[];})
  ]).then(function(results){
    var profiles=results[0]||[],assignments=results[1]||[], amap={};
    assignments.forEach(function(r){var k=assignmentKey(r.agent_name);if(k)amap[k]=r;});
    var names={},list=[];
    profiles.forEach(function(p){var k=assignmentKey(p.agent_name);if(!k||names[k])return;names[k]=true;var ar=amap[k]||{};if(ar.lp==="__REMOVED__"||p.relationship_status==="inactive")return;list.push({name:p.agent_name,tier:p.tier||ar.level||"C",lp:(ar.lp&&ar.lp!=="__REMOVED__")?ar.lp:"Unassigned",rm:ar.rm||"Unassigned",priority:!!ar.priority,status:p.lp_outreach_status==="nurture"?"nurture":((function(){var a=agents.find(function(x){return assignmentKey(x[0])===k;});return a&&!isActive(a)?"inactive":"active";})()),nurture_reason:p.nurture_reason||"",next_rm_followup:p.next_rm_followup||""});});
    assignments.forEach(function(ar){var k=assignmentKey(ar.agent_name);if(!k||names[k]||ar.lp==="__REMOVED__")return;names[k]=true;list.push({name:ar.agent_name,tier:ar.level||"C",lp:ar.lp||"Unassigned",rm:ar.rm||"Unassigned",priority:!!ar.priority,status:(function(){var a=agents.find(function(x){return assignmentKey(x[0])===k;});return a&&!isActive(a)?"inactive":"active";})()});});
    list=list.filter(function(r){if(q&&r.name.toLowerCase().indexOf(q)<0)return false;if(flp&&r.lp!==flp)return false;if(frm&&r.rm!==frm)return false;return true;}).sort(function(a,b){return a.name.localeCompare(b.name);});
    var countEl=document.getElementById("reassign-count-label");
    if(countEl)countEl.textContent=(flp?list.length+" relationship"+(list.length!==1?"s":"")+" assigned to "+flp:list.length+" relationship"+(list.length!==1?"s":"")+" shown")+(frm?" · RM: "+frm:"");
    if(!list.length){tbody.innerHTML='<tr><td colspan="8" style="padding:18px;text-align:center;color:var(--text-3)">No agents match these filters.</td></tr>';return;}
    tbody.innerHTML=list.map(function(r){
      var opts=["Unassigned","Gavin","Karen","Osgood","Jordan","Said","Isaak"].map(function(lp){return '<option'+(r.lp===lp?' selected':'')+'>'+lp+'</option>';}).join('');
      return '<tr><td style="font-weight:650">'+displayName(r.name)+'</td><td><span class="badge badge-'+String(r.tier).toLowerCase()+'">'+r.tier+'</span></td><td>'+rmOwnerBadge(r.name,r.rm)+'</td><td>'+(r.status==="nurture"?'<span style="background:#FFF2D6;color:#8A5A00;padding:3px 8px;border-radius:10px;font-size:10px;font-weight:700" title="'+(r.nurture_reason||'RM-directed light-touch relationship')+(r.next_rm_followup?' · Next RM check-in '+r.next_rm_followup:'')+'">RM NURTURE</span>':r.status==="active"?'<span style="color:#43A047">Active</span>':'<span class="badge badge-inactive">INACTIVE</span>')+'</td><td><button class="btn btn-sm '+(r.priority?'btn-success':'')+'" data-priority-name="'+r.name.replace(/"/g,'&quot;')+'" onclick="toggleLivePriority(this)">'+(r.priority?'Priority':'Set Priority')+'</button></td><td><span class="lp-tag lp-tag-'+r.lp+'">'+r.lp+'</span></td><td><select data-reassign-name="'+r.name.replace(/"/g,'&quot;')+'" onchange="reassignLiveAgent(this)">'+opts+'</select></td><td><button class="btn btn-sm btn-danger" data-name="'+r.name.replace(/"/g,'&quot;')+'" onclick="removeAgent(this)">Remove</button></td></tr>';
    }).join('');
  }).catch(function(e){tbody.innerHTML='<tr><td colspan="8" style="padding:18px;color:var(--red)">Could not load live assignments: '+e.message+'</td></tr>';});
}
function reassignLiveAgent(sel){var name=sel.getAttribute("data-reassign-name"),lp=sel.value||"Unassigned";if(!name)return;setSyncStatus("saving");sbFetch("POST","agent_assignments?on_conflict=agent_name",{agent_name:name,lp:lp,added:false}).then(function(){var a=agents.find(function(x){return assignmentKey(x[0])===assignmentKey(name);});if(a)a[2]=lp;setSyncStatus("live");renderReassign(); }).catch(function(postErr){sbFetch("PATCH","agent_assignments?agent_name=eq."+encodeURIComponent(name),{lp:lp}).then(function(){var a=agents.find(function(x){return assignmentKey(x[0])===assignmentKey(name);});if(a)a[2]=lp;setSyncStatus("live");renderReassign();}).catch(function(patchErr){lpHandleSyncError(patchErr||postErr);console.error("LP reassignment failed:",patchErr||postErr);alert("Could not save LP assignment. Please retry.");});});}
function toggleLivePriority(btn){var name=btn.getAttribute("data-priority-name");if(!name)return;var next=btn.textContent.trim()!=="Priority";sbFetch("PATCH","agent_assignments?agent_name=eq."+encodeURIComponent(name),{priority:next}).then(function(){var a=agents.find(function(x){return assignmentKey(x[0])===assignmentKey(name);});if(a)a[7]=next;renderReassign();}).catch(function(){alert("Could not update priority. Please retry.");});}

function renderRemoveList(){
  var q=document.getElementById("remove-q").value.toLowerCase(),el=document.getElementById("remove-list");
  if(!q){el.innerHTML='<div style="font-size:12px;color:#aaa;padding:8px 0">Type an agent name to search.</div>';return;}
  var list=agents.filter(function(a){return a[0].toLowerCase().indexOf(q)>=0;}).slice(0,8);
  if(!list.length){el.innerHTML='<div style="font-size:12px;color:#aaa;padding:8px 0">No agents found.</div>';return;}
  el.innerHTML=list.map(function(a){return'<div class="alert-item"><span style="font-weight:600;flex:1">'+displayName(a[0])+'</span><span class="badge badge-'+a[1].toLowerCase()+'">'+a[1]+'</span>'+rmOwnerBadge(a[0])+'<span class="lp-tag lp-tag-'+a[2]+'">'+a[2]+'</span><button class="btn btn-sm btn-danger" data-name="'+a[0]+'" onclick="removeAgent(this)">Remove</button></div>';}).join("");
}

function reassign(sel){var idx=parseInt(sel.getAttribute("data-idx"));agents[idx][2]=sel.value;saveAgents();renderAdmin();}
function togglePriority(btn){var idx=parseInt(btn.getAttribute("data-idx"));agents[idx][7]=!agents[idx][7];saveAgents();renderAdmin();}
function addAgent(){
  var name=document.getElementById("add-name").value.trim().toUpperCase();
  var lv=document.getElementById("add-level").value,lp=document.getElementById("add-lp").value,pri=document.getElementById("add-priority").value==="true";
  if(!name){alert("Enter a name.");return;}
  if(agents.find(function(a){return a[0]===name;})){alert("Already exists.");return;}
  agents.push([name,lv,lp,null,null,null,null,pri,0]);
  document.getElementById("add-name").value="";saveAgents();renderAdmin();alert(name+" added!");
}
async function resolveCanonicalProfileName(name){
  var raw=(name||"").trim();
  if(!raw)return null;
  // Case-insensitive exact lookup. We never guess when multiple case-variants exist because that
  // would risk changing the wrong canonical relationship.
  var rows=await sbFetch("GET","agent_profiles?agent_name=ilike."+encodeURIComponent(raw)+"&select=agent_name&limit=2");
  if(!rows||!rows.length)return null;
  if(rows.length>1)throw new Error("Multiple agent profiles match "+raw+". Review duplicates before changing roster status.");
  return rows[0].agent_name;
}

// v13: cross-tracker removal cleanup. agent_profiles.relationship_status is the shared source
// of truth; these extra best-effort writes immediately remove the agent from RM daily work too.
// Historical calls, meetings, notes and production history are preserved.
async function clearAgentFromRmWorkflows(canonicalName){
  var key=(canonicalName||"").trim().toLowerCase().replace(/\s+/g," ");
  var enc=encodeURIComponent(canonicalName);
  await Promise.all([
    sbFetch("DELETE","rm_work_queue?agent_key=eq."+encodeURIComponent(key)).catch(function(){}),
    sbFetch("PATCH","reconnect_agents?agent_name=ilike."+enc,{status:"removed"}).catch(function(){}),
    sbFetch("DELETE","outreach_prospects?agent_name=ilike."+enc).catch(function(){}),
    sbFetch("PATCH","amanda_activities?agent_name=ilike."+enc+"&follow_up_date=not.is.null",{follow_up_date:null}).catch(function(){})
  ]);
}

async function removeAgent(btn){
  var name=btn.getAttribute("data-name");
  if(!confirm("Remove "+name+" from BOTH the Core Team Tracker and RM Tracker? The tracker keeps historical activity, but removes the agent from active assignments and RM work queues."))return;
  // Resolve the exact stored profile name BEFORE mutating any local state. The legacy local roster
  // can contain ALL CAPS while agent_profiles contains human-entered casing; if the lookup is
  // ambiguous, abort cleanly rather than half-removing the agent locally.
  var canonicalName=name;
  try{canonicalName=(await resolveCanonicalProfileName(name))||name;}catch(e){alert(e.message);return;}
  agents=agents.filter(function(a){return a[0]!==name;});
  try{
    var s=localStorage.getItem(STORAGE_KEY);
    var d=s?JSON.parse(s):{};
    d.rm=d.rm||[];
    if(d.rm.indexOf(name)<0)d.rm.push(name);
    localStorage.setItem(STORAGE_KEY,JSON.stringify(d));
  }catch(e){}
  await sbFetch("POST","agent_assignments?on_conflict=agent_name",[{agent_name:canonicalName,lp:"__REMOVED__",priority:false,added:false,level:"C"}]).catch(function(e){console.warn("Could not persist removal marker:",e.message);});
  // Removal changes ONLY roster status. DNC and retained/Active Partner remain untouched.
  await sbFetch("PATCH","agent_profiles?agent_name=eq."+encodeURIComponent(canonicalName),{relationship_status:"inactive"}).catch(function(e){console.warn("Could not propagate removal to shared agent_profiles:",e.message);});
  await clearAgentFromRmWorkflows(canonicalName).catch(function(e){console.warn("Could not clear RM workflow rows:",e.message);});
  ctInactiveRosterNames.add(canonicalName.trim().toLowerCase());
  renderAdmin();
  renderLpAssignList();
  renderCoMktList();
}
async function reactivate(btn){
  var name=btn.getAttribute("data-name");
  var canonicalName=name;
  if(name){
    try{canonicalName=(await resolveCanonicalProfileName(name))||name;}catch(e){alert(e.message);return;}
  }
  var a=agents.find(function(x){return x[0]===name;});
  if(a)a[3]=localDateStr(TODAY);
  saveAgents();
  // relationship_status is the one authoritative signal going forward — only it changes here.
  // DNC and retained (Active Partner) are separate decisions and are never touched.
  if(name){
    await sbFetch("PATCH","agent_profiles?agent_name=eq."+encodeURIComponent(canonicalName),{relationship_status:"active"}).catch(function(e){console.warn("Could not propagate reactivation to shared agent_profiles:",e.message);});
    // Clear either canonical- or legacy-cased removal markers so the agent can be assigned again.
    var legacyNames=[canonicalName];if(name!==canonicalName)legacyNames.push(name);
    for(var li=0;li<legacyNames.length;li++){
      await sbFetch("PATCH","agent_assignments?agent_name=eq."+encodeURIComponent(legacyNames[li])+"&lp=eq.__REMOVED__",{lp:"Unassigned"}).catch(function(e){console.warn("Could not clear legacy __REMOVED__ marker:",e.message);});
    }
    ctInactiveRosterNames.delete(canonicalName.trim().toLowerCase());
    ctInactiveRosterNames.delete(name.trim().toLowerCase());
  }
  renderAdmin();
  renderLpAssignList();
  renderCoMktList();
}

function loadXLSX(){
  if(typeof XLSX!=="undefined"){document.getElementById("fileInput").click();return;}
  var res=document.getElementById("upload-result");res.textContent="Loading...";res.style.color="#888";
  var s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  s.onload=function(){res.textContent="";document.getElementById("fileInput").click();};
  s.onerror=function(){res.style.color="#E53935";res.textContent="Could not load Excel library.";};
  document.head.appendChild(s);
}

var chartJsLoadingPromise=null;
function ensureChartJs(){
  if(typeof Chart!=="undefined")return Promise.resolve();
  if(chartJsLoadingPromise)return chartJsLoadingPromise;
  chartJsLoadingPromise=new Promise(function(resolve,reject){
    var s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js";
    s.onload=function(){resolve();};
    s.onerror=function(){chartJsLoadingPromise=null;reject(new Error("Could not load Chart.js"));};
    document.head.appendChild(s);
  });
  return chartJsLoadingPromise;
}

async function handleUpload(input){
  var file=input.files[0];if(!file)return;
  input.value="";
  var res=document.getElementById("upload-result");res.textContent="Reading...";res.style.color="";
  try{
      var xlsx=window.XLSX;
      if(!xlsx){
        xlsx=await new Promise(function(resolve,reject){
          var script=document.createElement("script");
          script.src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
          script.onload=function(){window.XLSX?resolve(window.XLSX):reject(new Error("Excel reader did not initialize."));};
          script.onerror=function(){reject(new Error("Could not load the Excel reader."));};
          document.head.appendChild(script);
        });
      }
      var wb=xlsx.read(await file.arrayBuffer(),{type:"array",cellDates:true});
      var rawRows=xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:null});

      // v70 — normalize Power BI to ONE row per agent before doing anything else.
      // The old importer counted raw spreadsheet rows as agents. A duplicated agent therefore
      // inflated Active Partner, tier, prequal and pipeline totals and could disagree with the
      // server-backed RM scorecard, which already dedupes by agent name.
      function pbAgentKey(row){return String(row&&row["Agent"]||"").trim().toLowerCase().replace(/\s+/g," ");}
      function pbNum(v){if(v instanceof Date)return Number((v.getTime()/86400000)+25569)||0;var n=parseFloat(String(v==null?"":v).replace(/[$,%]/g,"").replace(/,/g,""));return Number.isFinite(n)?n:0;}
      function pbDateMs(v){if(v===null||v===undefined||v==="")return 0;try{var d;if(v instanceof Date)d=v;else if(typeof v==="number"&&v>1)d=new Date(Math.round((v-25569)*86400*1000));else d=new Date(v);return Number.isFinite(d.getTime())?d.getTime():0;}catch(e){return 0;}}
      function pbMergeRows(base,next){
        var out=Object.assign({},base||{}),levelRank={A:3,B:2,C:1};
        var oldLv=String(out["Level"]||"").trim().toUpperCase(),newLv=String(next&&next["Level"]||"").trim().toUpperCase();
        if((levelRank[newLv]||0)>(levelRank[oldLv]||0))out["Level"]=next["Level"];
        ["Active Prequals","Active In Pipeline","Closed Past Year","Total Leads Past Year","Closed Past Year Vol"].forEach(function(c){
          if(pbNum(next&&next[c])>pbNum(out[c]))out[c]=next[c];
        });
        ["Latest Lead (In Velocify)","Latest File Started","Latest Contract","Latest Close"].forEach(function(c){
          if(pbDateMs(next&&next[c])>pbDateMs(out[c]))out[c]=next[c];
        });
        ["Email","Phone Number","Address","Birthday"].forEach(function(c){if((out[c]===null||out[c]===undefined||String(out[c]).trim()==="")&&next&&next[c]!==null&&next[c]!==undefined&&String(next[c]).trim()!=="")out[c]=next[c];});
        return out;
      }
      var rawValidPbRows=rawRows.filter(function(row){var n=(row["Agent"]||"").toString().trim();return n&&n.toUpperCase()!=="AGENT"&&n.toUpperCase()!=="NAN"&&!ctExcludedFromActiveAgentRoster(n);});
      var uniquePbMap=new Map();
      rawValidPbRows.forEach(function(row){var k=pbAgentKey(row);if(!k)return;uniquePbMap.set(k,uniquePbMap.has(k)?pbMergeRows(uniquePbMap.get(k),row):Object.assign({},row));});
      var rows=Array.from(uniquePbMap.values());
      var validPbRows=rows;
      var duplicateRows=Math.max(0,rawValidPbRows.length-validPbRows.length);
      var pbSnapshot={imported_at:new Date().toISOString(),active_partner_definition:"POWER_BI_LEVEL_POPULATION",raw_rows:rawValidPbRows.length,unique_rows:validPbRows.length,duplicate_rows_ignored:duplicateRows,active_partner_rows:0,levels:{Channel:0,A:0,B:0,C:0,Blank:0,Other:0},tier_agents:{Channel:[],A:[],B:[],C:[],Blank:[],Other:[]},active_prequals_total:0,active_prequals_agents:0,active_pipeline_total:0,active_pipeline_agents:0,closed_12mo_total:0,closed_12mo_agents:0,by_agent:{}};
      function pbIsoDate(v){var ms=pbDateMs(v);return ms?new Date(ms).toISOString().slice(0,10):null;}
      validPbRows.forEach(function(row){
        var rawName=(row["Agent"]||"").toString().trim();
        var sourceLevel=(row["Level"]||"").toString().trim().toUpperCase();
        var preq=parseInt(row["Active Prequals"])||0,pipe=parseInt(row["Active In Pipeline"])||0,closed12=parseInt(row["Closed Past Year"])||0,totalLeads12=parseInt(row["Total Leads Past Year"])||0;
        // A blank Power BI Level can still be a qualified C partner when the export records at least one lead.
        var lv=(sourceLevel==="A"||sourceLevel==="B"||sourceLevel==="C")?sourceLevel:(!sourceLevel?(closed12>=4?"A":closed12>=2?"B":(closed12>=1||totalLeads12>=1)?"C":""):sourceLevel);
        if(lv==="A"||lv==="B"||lv==="C"){row["Level"]=lv;pbSnapshot.levels[lv]++;pbSnapshot.tier_agents[lv].push(rawName);}else if(!lv){pbSnapshot.levels.Blank++;pbSnapshot.tier_agents.Blank.push(rawName);}else{pbSnapshot.levels.Other++;pbSnapshot.tier_agents.Other.push(rawName);}
        pbSnapshot.active_prequals_total+=preq;pbSnapshot.active_pipeline_total+=pipe;pbSnapshot.closed_12mo_total+=closed12;
        if(preq>0)pbSnapshot.active_prequals_agents++;if(pipe>0)pbSnapshot.active_pipeline_agents++;if(closed12>0)pbSnapshot.closed_12mo_agents++;if(closed12>=10){pbSnapshot.levels.Channel++;pbSnapshot.tier_agents.Channel.push(rawName);}
        pbSnapshot.by_agent[rawName.toLowerCase()]={name:rawName,level:(lv==="A"||lv==="B"||lv==="C")?lv:null,source_level:sourceLevel||null,active_prequals:preq,active_pipeline:pipe,closed_12mo:closed12,total_leads_12mo:totalLeads12,latest_lead:pbIsoDate(row["Latest Lead (In Velocify)"]),latest_started:pbIsoDate(row["Latest File Started"]),latest_contract:pbIsoDate(row["Latest Contract"]),latest_close:pbIsoDate(row["Latest Close"]),email:String(row["Email"]||"").trim(),phone:String(row["Phone Number"]||"").trim()};
      });
      pbSnapshot.active_partner_rows=Number(pbSnapshot.levels.A||0)+Number(pbSnapshot.levels.B||0)+Number(pbSnapshot.levels.C||0);
      try{localStorage.setItem("ct_powerbi_snapshot_v1",JSON.stringify(pbSnapshot));window.CT_POWERBI_SNAPSHOT=pbSnapshot;}catch(snapshotErr){window.CT_POWERBI_SNAPSHOT=pbSnapshot;}
      var up=[],added=0,updated=0,flagged=0;
      // Refresh the shared removed/inactive roster BEFORE processing Power BI. Otherwise a row
      // that still exists in the export can overwrite __REMOVED__ in agent_assignments and make
      // the agent reappear after refresh. Removed means removed until explicitly reactivated.
      await loadInactiveRosterNames();
      // Build a name->row map for co-marketing lookup
      var pbMap={};
      rows.forEach(function(row){
        var n=(row["Agent"]||"").toString().trim().toUpperCase();
        if(n&&n!=="AGENT"&&n!=="NAN"&&!ctInactiveRosterNames.has(n.toLowerCase()))pbMap[n]=row;
      });
      rows.forEach(function(row){
        var n=(row["Agent"]||"").toString().trim().toUpperCase();
        var lv=(row["Level"]||"").toString().trim();
        if(!n||n==="AGENT"||n==="NAN"||ctInactiveRosterNames.has(n.toLowerCase()))return;
        // Power BI hands back a raw Excel serial number for these date columns even with
        // cellDates:true (no explicit date format on the cell) — new Date(rawNumber) misreads
        // that as milliseconds-since-epoch and silently produces 1970-01-01 for every row.
        // 25569 is the day offset between Excel's epoch (Dec 30 1899) and the JS epoch.
        var gd=function(c){var v=row[c];if(v===null||v===undefined||v==="")return null;try{var d;if(v instanceof Date){d=v;}else if(typeof v==="number"&&v>1){d=new Date(Math.round((v-25569)*86400*1000));}else{d=new Date(v);}return(!isNaN(d.getTime())&&d.getFullYear()>1971)?d.toISOString().split("T")[0]:null;}catch(e){return null;}};
        var closedPastYear=parseInt(row["Closed Past Year"])||0;
        var existing=agents.find(function(x){return x[0]===n;});
        var preservedLp=existing?existing[2]:"Unassigned";
        var preservedPriority=existing?existing[7]:false;
        var u=[n,lv||"C",preservedLp,gd("Latest Lead (In Velocify)"),gd("Latest File Started"),gd("Latest Contract"),gd("Latest Close"),preservedPriority,closedPastYear];
        up.push(u);
        if(existing){existing[1]=u[1]||existing[1];existing[3]=u[3];existing[4]=u[4];existing[5]=u[5];existing[6]=u[6];existing[8]=u[8]||existing[8]||0;if(!isActive(existing))flagged++;updated++;}
        else{agents.push(u);added++;}
      });

      // ── Co-marketing partner sync from same Power BI export ──
      var doCmSync=function(){
        if(!coMktPartners.length)return;
        var cmUpdates=[];
        coMktPartners.forEach(function(p){
          if(!p.id)return; // skip if id missing
          var rosterNames=(p.agent_roster||[]).map(function(r){return(r.name||r.alias||"").trim().toUpperCase();}).filter(Boolean);
          var partnerNameKey=(p.partner_name||"").trim().toUpperCase().replace(/ TEAM$/,"").replace(/ MEJIA$/,"");
          var matchedRows=[];
          Object.keys(pbMap).forEach(function(pbName){
            if(rosterNames.some(function(rn){return pbName===rn||pbName.indexOf(rn)>=0||rn.indexOf(pbName)>=0;})
               ||pbName.indexOf(partnerNameKey)>=0||partnerNameKey.indexOf(pbName)>=0){
              matchedRows.push(pbMap[pbName]);
            }
          });
          if(!matchedRows.length)return;
          var gd=function(col){
            var vals=matchedRows.map(function(r){
              var v=r[col];
              if(v===null||v===undefined||v==="")return null;
              try{
                var d;
                if(v instanceof Date){d=v;}
                else if(typeof v==="number"&&v>1){
                  // Excel serial: days since 1900-01-01, adjust for leap year bug
                  d=new Date(Math.round((v-25569)*86400*1000));
                }
                else{d=new Date(v);}
                return(!isNaN(d.getTime())&&d.getFullYear()>1971)?d:null;
              }catch(e){return null;}
            }).filter(Boolean);
            return vals.length?vals.sort(function(a,b){return b-a;})[0].toISOString().split("T")[0]:null;
          };
          var totalLeads=matchedRows.reduce(function(s,r){return s+(parseInt(r["Total Leads Past Year"])||0);},0);
          var totalClosed=matchedRows.reduce(function(s,r){return s+(parseInt(r["Closed Past Year"])||0);},0);
          // Closed Past Year Vol can come back as a misread Date object in some xlsx versions — extract numeric value
          var totalVol=matchedRows.reduce(function(s,r){
            var v=r["Closed Past Year Vol"];
            if(!v)return s;
            if(typeof v==="number")return s+v;
            if(v instanceof Date)return s+((v.getTime()/86400000)+25569); // reverse date serial
            var n=parseFloat(v);
            return s+(isNaN(n)?0:n);
          },0);
          var payload={pb_leads_12mo:totalLeads,pb_closed_12mo:totalClosed,pb_vol_12mo:totalVol,pb_latest_lead:gd("Latest Lead (In Velocify)"),pb_latest_contract:gd("Latest Contract"),pb_latest_close:gd("Latest Close"),pb_synced_at:new Date().toISOString().split("T")[0]};
          Object.assign(p,payload);
          cmUpdates.push(sbFetch("PATCH","co_marketing_partners?id=eq."+p.id,payload).catch(function(e){console.error("co-mkt sync failed for",p.partner_name,e);}));
        });
        if(cmUpdates.length){
          Promise.all(cmUpdates).then(function(){
            console.log("Co-marketing Power BI sync complete for",cmUpdates.length,"partners");
            if(typeof renderDirectorView==="function"&&currentUser==="Director")renderDirectorView();
          }).catch(function(e){console.error("co-mkt sync error",e);});
        }
      };
      if(coMktPartners.length){doCmSync();}
      else{loadCoMktPartners().then(function(){setTimeout(doCmSync,500);});}

      // Phase 5: persist agent_assignments, then WAIT for the shared agent_profiles sync.
      // Previously the UI said "Done" before agent_profiles had been stamped with the new
      // Power BI import timestamp. Portfolio Review could therefore still show 0* immediately
      // after a successful upload even though the slower profile sync was still running.
      var agentRows=up.map(function(u){return{agent_name:u[0],level:u[1]||"C",lp:u[2]||"Unassigned",priority:u[7]||false,added:false,closed_past_year:u[8]||0};});
      res.style.color="";
      res.textContent="Syncing current Power BI population to Portfolio Review...";
      var assignmentSyncOk=true;
      if(agentRows.length){
        try{
          await sbFetch("POST","agent_assignments?on_conflict=agent_name",agentRows);
        }catch(assignErr){
          assignmentSyncOk=false;
          console.warn("agent_assignments sync failed:",assignErr.message);
        }
      }

      // This is the authoritative Portfolio baseline sync. Do not report completion until it
      // finishes, because it writes powerbi_last_seen_at / powerbi_level as well as production,
      // tier and 90-day Active Partner status.
      var profileSyncResult=await window.lpSyncAgentProfilesFromUpload(rows);
      if(typeof window.ctInvalidateLivePowerBi==='function')window.ctInvalidateLivePowerBi();
      var livePbSummary=null;
      try{if(typeof window.ctGetLivePowerBiSummary==='function')livePbSummary=await window.ctGetLivePowerBiSummary(true);}catch(livePbErr){throw new Error("Power BI saved, but the shared server read-back failed: "+livePbErr.message);}
      // v70 — success is only real when the authoritative shared server snapshot matches this upload.
      var expectedActive=Number(pbSnapshot.levels.A||0)+Number(pbSnapshot.levels.B||0)+Number(pbSnapshot.levels.C||0);
      if(livePbSummary){
        var serverActive=Number(livePbSummary.active_partner_rows||0),src=livePbSummary.source_levels||{};
        var sourceMatches=Number(src.A||0)===Number(pbSnapshot.levels.A||0)&&Number(src.B||0)===Number(pbSnapshot.levels.B||0)&&Number(src.C||0)===Number(pbSnapshot.levels.C||0);
        if(serverActive!==expectedActive||!sourceMatches){
          throw new Error("Power BI did not fully sync. Upload has "+expectedActive+" unique A/B/C agents ("+pbSnapshot.levels.A+" A · "+pbSnapshot.levels.B+" B · "+pbSnapshot.levels.C+" C), but the shared server has "+serverActive+". Please retry the upload before using tracker totals.");
        }
      }

      // Health snapshots must run AFTER the profile sync, not race it.
      try{await window.lpWriteHealthSnapshots();}
      catch(healthErr){console.warn("Health snapshot write failed (non-critical):",healthErr.message);}

      renderAdmin();
      if(coMktPartners.length&&typeof renderDirectorView==="function"&&currentUser==="Director")renderDirectorView();
      // If Portfolio Review is already open, refresh it from the newly stamped profiles now.
      if(document.getElementById("pfr-body")){try{await window.pfrLoad();}catch(pfrErr){console.warn("Portfolio refresh failed:",pfrErr.message);}}
      if(document.getElementById("view-partner-growth")&&document.getElementById("view-partner-growth").classList.contains("active")&&typeof ctRenderTierOpportunities==="function"){
        try{await ctRenderTierOpportunities();}catch(tierErr){console.warn("Next-tier opportunities refresh failed:",tierErr.message);}
      }

      res.style.color="#43A047";
      var pbActiveImported=Number(pbSnapshot.levels.A||0)+Number(pbSnapshot.levels.B||0)+Number(pbSnapshot.levels.C||0);
      res.textContent="Done — "+pbActiveImported+" Power BI Active Agents ("+pbSnapshot.levels.A+" A · "+pbSnapshot.levels.B+" B · "+pbSnapshot.levels.C+" C) from "+pbSnapshot.raw_rows+" named uploaded rows"+(pbSnapshot.duplicate_rows_ignored?" · "+pbSnapshot.duplicate_rows_ignored+" duplicate row"+(pbSnapshot.duplicate_rows_ignored===1?"":"s")+" merged":"")+" · Active Prequals: "+pbSnapshot.active_prequals_total+" across "+pbSnapshot.active_prequals_agents+" agents · Active Pipeline: "+pbSnapshot.active_pipeline_total+" across "+pbSnapshot.active_pipeline_agents+" agents · 12mo closings: "+pbSnapshot.closed_12mo_total+". "+(profileSyncResult&&profileSyncResult.verified?profileSyncResult.verified+" shared profiles verified ✓":"Shared profiles verified ✓")+(assignmentSyncOk?"":" · assignment sync needs review");
      try{var hubPb=document.getElementById("lpv3-pb-status");if(hubPb)hubPb.textContent="Current Power BI: "+pbActiveImported+" active agents · "+pbSnapshot.levels.A+" A · "+pbSnapshot.levels.B+" B · "+pbSnapshot.levels.C+" C · "+pbSnapshot.active_prequals_total+" active prequals · "+pbSnapshot.active_pipeline_total+" active pipeline · shared profiles verified just now";}catch(e){}
      try{if(typeof window.ctV55RefreshTeamSnapshot==="function")await window.ctV55RefreshTeamSnapshot();else if(typeof window.lpv2RenderSnapshot==="function")await window.lpv2RenderSnapshot();}catch(e){console.warn("Team Snapshot refresh after Power BI upload",e)}
  }catch(err){res.style.color="#E53935";res.textContent="Error: "+(err&&err.message?err.message:String(err));}
}

var VELOCIFY_SEED={"JOHN BRUNNER":{"total":1,"mtd":0,"wtd":0},"ANNIE MORENO":{"total":4,"mtd":3,"wtd":2},"CELINE WILLIAMS":{"total":1,"mtd":0,"wtd":0},"BRANDON THOMPSON":{"total":1,"mtd":0,"wtd":0},"LUIS GIL":{"total":1,"mtd":1,"wtd":0},"CHRIS REED":{"total":3,"mtd":3,"wtd":0},"HYPATIA ESPINAL":{"total":1,"mtd":1,"wtd":0},"KRISTINA MURPHY":{"total":1,"mtd":1,"wtd":0},"JAIDEN BALLAH":{"total":1,"mtd":1,"wtd":0},"MEGAN LYNCH":{"total":1,"mtd":1,"wtd":0},"TODD STONE":{"total":8,"mtd":8,"wtd":4},"OSCAR MARTINEZ":{"total":2,"mtd":2,"wtd":0},"DONALD PAYNE JR":{"total":1,"mtd":1,"wtd":0},"YVETTA HARRISON":{"total":1,"mtd":1,"wtd":0},"ROSALIA PABLO":{"total":2,"mtd":2,"wtd":0},"SAHAR SHALASH":{"total":1,"mtd":1,"wtd":0},"BRIAN ZINN":{"total":1,"mtd":1,"wtd":0},"BRANDON MCCLENDON":{"total":1,"mtd":1,"wtd":0},"PAIGE LUDWIG":{"total":1,"mtd":1,"wtd":0},"TATIANA GRIGORITA":{"total":1,"mtd":1,"wtd":0},"CLAUDIA CHUECO":{"total":1,"mtd":1,"wtd":0},"TOM NEWMAN":{"total":1,"mtd":1,"wtd":0},"KISHMA JAMES":{"total":1,"mtd":1,"wtd":1},"TIMOTHY OLIVER":{"total":1,"mtd":1,"wtd":1},"HEATHER EMMERT":{"total":1,"mtd":1,"wtd":1},"LEXIS GRANDY":{"total":1,"mtd":1,"wtd":1}};

var prevNotes={};
var rmActivity={};
// v62: shared team-contact coordination. These maps are built from RM activity so an LP
// does not get a routine call task immediately after Amanda/Nyny connected or while the RM
// already owns a dated follow-up.
var rmLatestMeaningful={};
var rmCoordinationHolds={};
var selfReportedReferrals={};
var receivedLeadsData={};
var rmFollowupsData={};
var agentFirstCall={};
var agentLastCall={};
var coMarketingAgents={};
var coMarketingPartnerRoster={};
function coMarketingKey(name){return String(name||"").trim().replace(/\s+/g," ").toUpperCase();}
function coMarketingIsActive(name){return !!coMarketingAgents[coMarketingKey(name)];}
function coMarketingIsBilled(name){return !!coMarketingPartnerRoster[coMarketingKey(name)];}
var agentMilestones={};  // Phase 2: activation tracking
var leadPipelineData={daily:{},wtd:{},mtd:{},ytd:{}};  // LP lead pipeline breakdown
var churnRiskData={};    // Phase 3: churn risk by agent
var lpEffectiveness={};  // Phase 4: LP effectiveness scores

function loadCoMarketing(){
  // Merge verified active advertising partners with manually marked agent profiles.
  return Promise.all([
    sbFetch("GET","agent_profiles?co_marketing=eq.true&select=agent_name&limit=5000").catch(function(){return[];}),
    sbFetch("GET","co_marketing_partners?status=eq.active&select=partner_name,agent_roster&limit=500").catch(function(){return[];})
  ]).then(function(result){
    coMarketingAgents={};coMarketingPartnerRoster={};
    (result[0]||[]).forEach(function(p){var k=coMarketingKey(p.agent_name);if(k)coMarketingAgents[k]=true;});
    (result[1]||[]).forEach(function(p){
      var roster=Array.isArray(p.agent_roster)?p.agent_roster:[];
      if(!roster.length)roster=[{name:p.partner_name}];
      roster.forEach(function(a){[a.name,a.alias].forEach(function(v){
        var k=coMarketingKey(v);if(!k)return;
        coMarketingAgents[k]=true;coMarketingPartnerRoster[k]=true;
      });});
    });
  }).catch(function(e){console.warn("Co-marketing roster unavailable",e)});
}

function getBirthdayAgentsThisWeek(){
  var birthdays=[];
  var now=new Date();
  var weekStart=new Date(now);weekStart.setDate(now.getDate()-(now.getDay()===0?6:now.getDay()-1));weekStart.setHours(0,0,0,0);
  var weekEnd=new Date(weekStart);weekEnd.setDate(weekStart.getDate()+6);
  var months=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  Object.values(contactCache).forEach(function(c){
    if(!c.birthday||!c.agent_name)return;
    var mIdx=-1,day=-1;
    // Reliable path: new structured "MM-DD" format from the dropdown fields
    var structured=c.birthday.match(/^(\d{2})-(\d{2})$/);
    if(structured){
      mIdx=parseInt(structured[1],10)-1;
      day=parseInt(structured[2],10);
    } else {
      // Fallback: legacy free-text entries saved before the format was standardized
      var parts=c.birthday.toLowerCase().trim().split(/[\s\/\-]+/);
      if(parts.length<2)return;
      parts.forEach(function(p){var mi=months.indexOf(p.substring(0,3));if(mi>=0)mIdx=mi;var n=parseInt(p);if(!isNaN(n)&&n>=1&&n<=31)day=n;});
    }
    if(mIdx<0||day<0)return;
    var bday=new Date(now.getFullYear(),mIdx,day);
    if(bday>=weekStart&&bday<=weekEnd)birthdays.push({name:c.agent_name,birthday:c.birthday});
  });
  return birthdays;
}

function renderCoMktList(){
  var q=(document.getElementById("comkt-q")||{value:""}).value.toLowerCase();
  var el=document.getElementById("comkt-list");if(!el)return;

  // Active co-marketing agents (always shown at top) — excludes anyone removed from the
  // Current Relationship Roster, even though `agents` itself has no roster-status field.
  var activeAgents=agents.filter(function(a){return coMarketingIsActive(a[0])&&!ctInactiveRosterNames.has((a[0]||"").trim().toLowerCase());});
  // Search results (non-active matching query) — same exclusion
  var searchResults=q?agents.filter(function(a){
    return!coMarketingIsActive(a[0])&&a[0].toLowerCase().indexOf(q)>=0&&!ctInactiveRosterNames.has((a[0]||"").trim().toLowerCase());
  }).slice(0,15):[];

  function agentRow(a,active){
    var lp=(a[2]&&a[2]!=="null"&&a[2]!=="undefined")?a[2]:"—";
    var lpClass=(a[2]&&a[2]!=="null"&&a[2]!=="undefined")?"lp-tag lp-tag-"+a[2]:"";
    var lpSpan=lpClass?'<span class="'+lpClass+'">'+lp+'</span>':'<span style="color:#aaa;font-size:12px">'+lp+'</span>';
    var billed=coMarketingIsBilled(a[0]);
    var action=billed?'<span title="Manage this agent in Co-Marketing Relationships" style="font-size:11px;color:#526C79;font-weight:650;margin-left:10px">Billing roster</span>':
      '<button class="btn btn-sm '+(active?"btn-danger":"btn-success")+'" style="margin-left:10px" data-name="'+a[0]+'" data-active="'+(active?"true":"false")+'" onclick="toggleCoMarketing(this)">'+(active?"✕ Remove":"✓ Mark active")+'</button>';
    return'<div class="alert-item" style="'+(active?"background:#E8F5F0;border-color:#6EE7C4;":"")+'">'+
      '<span style="font-weight:600;flex:1">'+displayName(a[0])+'</span>'+
      '<span class="badge badge-'+(a[1]||"c").toLowerCase()+'" style="margin-right:6px">'+a[1]+'</span>'+
      lpSpan+action+'</div>';
  }

  var html2="";
  if(activeAgents.length){
    html2+='<div style="font-size:11px;font-weight:700;color:#0A6B4C;text-transform:uppercase;letter-spacing:.5px;padding:8px 4px 6px">Active co-marketing ('+activeAgents.length+')</div>';
    html2+=activeAgents.map(function(a){return agentRow(a,true);}).join("");
  }
  if(searchResults.length){
    html2+='<div style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.5px;padding:12px 4px 6px;margin-top:'+(activeAgents.length?'8px':'0')+'">Search results</div>';
    html2+=searchResults.map(function(a){return agentRow(a,false);}).join("");
  }
  if(!activeAgents.length&&!searchResults.length){
    html2='<div style="padding:20px;text-align:center;color:#aaa;font-size:13px">'+(q?"No agents found matching \""+q+"\"":"No active co-marketing agents. Search above to add one.")+"</div>";
  }
  el.innerHTML=html2;
}

function toggleCoMarketing(btn){
  var name=btn.getAttribute("data-name"),active=btn.getAttribute("data-active")==="true";
  if(coMarketingIsBilled(name)){alert("This agent is part of an active billing partnership. Update their roster under Co-Marketing Relationships instead.");return;}
  var newVal=!active;
  coMarketingAgents[coMarketingKey(name)]=newVal;
  if(!contactCache[name])contactCache[name]={agent_name:name};
  contactCache[name].co_marketing=newVal;
  sbFetch("GET","agent_profiles?agent_name=eq."+encodeURIComponent(name)+"&limit=1").then(function(res){
    var method=(res&&res.length)?"PATCH":"POST";
    var path=method==="PATCH"?"agent_profiles?agent_name=eq."+encodeURIComponent(name):"agent_profiles";
    return sbFetch(method,path,{agent_name:name,co_marketing:newVal});
  }).then(function(){renderCoMktList();}).catch(function(){});
}

function loadVelocifyLeads(){
  // Pull rich data from agent_lead_summary view
  return sbFetch("GET","agent_lead_summary?select=agent_name_upper,total_leads,mtd_leads,wtd_leads,file_starts,mtd_file_starts,last_lead_date,last_buyer_name,last_status,last_action_note,assigned_lp&limit=500").then(function(res){
    if(!res||!res.length){
      // Fallback to raw velocify_leads if view not ready
      return sbFetch("GET","velocify_leads?select=referral_partner_name,date_added&order=date_added.desc&limit=1000").then(function(res2){
        if(!res2||!res2.length)return;
        var now=new Date(),ms=new Date(now.getFullYear(),now.getMonth(),1),ws=new Date(now);ws.setDate(now.getDate()-now.getDay()+1);
        var fresh={};
        res2.forEach(function(r){
          var name=(r.referral_partner_name||"").trim().toUpperCase();
          if(!name)return;
          var d=new Date(r.date_added);
          if(!fresh[name])fresh[name]={total:0,mtd:0,wtd:0,file_starts:0,last_lead_date:null,last_buyer_name:null,last_status:null,last_action_note:null};
          fresh[name].total++;
          if(d>=ms)fresh[name].mtd++;
          if(d>=ws)fresh[name].wtd++;
          var iso=String(r.date_added||"").slice(0,10);
          if(iso&&(!fresh[name].last_lead_date||iso>fresh[name].last_lead_date))fresh[name].last_lead_date=iso;
        });
        if(Object.keys(fresh).length>0){VELOCIFY_SEED=fresh;syncLiveVelocifyDatesIntoAgents();}
      });
    }
    var fresh={};
    res.forEach(function(r){
      var name=(r.agent_name_upper||"").trim();
      if(!name)return;
      fresh[name]={
        total:r.total_leads||0,
        mtd:r.mtd_leads||0,
        wtd:r.wtd_leads||0,
        file_starts:r.file_starts||0,
        mtd_file_starts:r.mtd_file_starts||0,
        last_lead_date:r.last_lead_date||null,
        last_buyer_name:r.last_buyer_name||null,
        last_status:r.last_status||null,
        last_action_note:r.last_action_note||null,
        assigned_lp:r.assigned_lp||null
      };
    });
    if(Object.keys(fresh).length>0){VELOCIFY_SEED=fresh;syncLiveVelocifyDatesIntoAgents();}
  }).catch(function(){});
}

function loadAgentMilestones(){
  return sbFetch("GET","agent_milestones?select=agent_name,first_lp_call_date,first_lp_call_by,first_amanda_visit_date,first_lead_date,first_file_start_date,activation_status&limit=500").then(function(res){
    agentMilestones={};
    if(res)res.forEach(function(r){agentMilestones[r.agent_name.toUpperCase()]=r;});
  }).catch(function(){});
}

function loadChurnRisk(){
  return sbFetch("GET","agent_churn_risk?select=agent_name_upper,assigned_lp,total_leads,last_lead_date,days_since_lead,days_since_call,churn_risk&limit=500").then(function(res){
    churnRiskData={};
    if(res)res.forEach(function(r){churnRiskData[r.agent_name_upper]=r;});
  }).catch(function(){});
}

function loadLpEffectiveness(){
  return sbFetch("GET","lp_effectiveness?select=lp,total_calls_logged,mtd_leads_received,mtd_file_starts,leads_per_100_calls&limit=10").then(function(res){
    lpEffectiveness={};
    if(res)res.forEach(function(r){lpEffectiveness[r.lp]=r;});
  }).catch(function(){});
}

function loadPrevNotes(){
  // Load most recent note for every agent from full history, any LP, any week
  return sbFetch("GET","call_logs_history?select=agent_name,note,call_date,lp&order=call_date.desc&limit=2000").then(function(res){
    prevNotes={};
    if(res)res.forEach(function(r){
      // Keep only the most recent note per agent (first one seen since sorted desc)
      if(r.note&&r.note.trim()&&!prevNotes[r.agent_name]){
        prevNotes[r.agent_name]={note:r.note,call_date:r.call_date,lp:r.lp};
      }
    });
  }).catch(function(){});
}

function loadRmActivity(){
  // Pull enough shared RM history to coordinate work across BOTH trackers, not just this week.
  // The LP queue uses meaningful RM connections as team touches and future RM follow-up dates
  // as explicit holds so we do not double-contact the same partner.
  var todayStr=localDateStr(TODAY);
  var cutoff=new Date(TODAY);cutoff.setDate(cutoff.getDate()-180);
  var cutoffStr=localDateStr(cutoff);
  return sbFetch("GET","amanda_activities?act_date=gte."+cutoffStr+"&select=agent_name,act_type,act_date,outcome,follow_up_date,notes,created_at&order=act_date.desc,created_at.desc&limit=5000").then(function(res){
    rmActivity={};rmLatestMeaningful={};rmCoordinationHolds={};
    var rows=res||[];
    rows.forEach(function(r){
      if(!r||!r.agent_name)return;
      var exact=r.agent_name||"",upper=exact.toUpperCase(),ak=assignmentKey(exact);
      // Existing card context keeps the latest RM activity of any kind.
      if(!rmActivity[exact]||String(r.act_date||"")>rmActivity[exact])rmActivity[exact]=r.act_date;
      if(!rmActivity[upper]||String(r.act_date||"")>rmActivity[upper])rmActivity[upper]=r.act_date;
      // Coordination cadence uses only real connections/held meetings — not voicemail/no answer.
      if(isMeaningfulOutcome(r.outcome,NOT_MEANINGFUL_RM_OUTCOMES,r.act_type)){
        if(ak&&(!rmLatestMeaningful[ak]||String(r.act_date||"")>rmLatestMeaningful[ak]))rmLatestMeaningful[ak]=String(r.act_date||"").slice(0,10);
      }
    });
    rows.forEach(function(r){
      if(!r||!r.agent_name||!r.follow_up_date)return;
      var fu=String(r.follow_up_date).slice(0,10);
      var ak=assignmentKey(r.agent_name),origin=String(r.act_date||r.created_at||"").slice(0,10),later=rmLatestMeaningful[ak]||"";
      // A later real connection closes an older promised follow-up; do not let stale dates pause LP work.
      if(origin&&later&&later>origin)return;
      var owner="RM";try{if(typeof ctRmOwnerFromNotes==="function")owner=ctRmOwnerFromNotes(r.notes)||"RM";}catch(e){}
      var cur=rmCoordinationHolds[ak];
      if(!cur||fu<cur.follow_up_date)rmCoordinationHolds[ak]={follow_up_date:fu,act_date:origin,act_type:r.act_type||"RM follow-up",outcome:r.outcome||"",owner:owner};
    });
  }).catch(function(err){console.warn("RM activity load failed:",err);});
}

function lpRmCoordinationHold(a){
  if(!a||!a[0])return null;
  var ak=assignmentKey(a[0]),todayStr=localDateStr(TODAY),hold=rmCoordinationHolds[ak]||null;
  if(hold){
    var overdue=hold.follow_up_date<todayStr;
    return {kind:"followup",until:hold.follow_up_date,last:hold.act_date||null,owner:hold.owner||"RM",message:(hold.owner||"RM")+" owns "+(overdue?"OVERDUE follow-up ":"follow-up ")+fmt(hold.follow_up_date)+" — routine LP outreach paused"};
  }
  var last=rmLatestMeaningful[ak]||null;
  if(last){
    var dt=new Date(last+"T12:00:00"),days=Math.max(0,Math.floor((TODAY-dt)/86400000)),wait=tierWindow(a);
    if(days<wait){
      var due=new Date(dt);due.setDate(due.getDate()+wait);var dueStr=localDateStr(due);
      return {kind:"recent",until:dueStr,last:last,owner:"RM team",message:"RM team connected "+fmt(last)+" — routine LP outreach paused until "+fmt(dueStr)};
    }
  }
  return null;
}

function loadRmFollowups(){
  var cutoff=new Date(TODAY);cutoff.setDate(cutoff.getDate()-30);
  var cutoffStr=cutoff.getFullYear()+"-"+String(cutoff.getMonth()+1).padStart(2,"0")+"-"+String(cutoff.getDate()).padStart(2,"0");
  return sbFetch("GET","rm_followups?followup_date=gte."+cutoffStr+"&select=agent_name,lp,amanda_note,followup_date,activity_type&order=followup_date.desc&limit=500").then(function(res){
    rmFollowupsData={};
    if(res)res.forEach(function(r){
      var key=r.agent_name.toUpperCase();
      if(!rmFollowupsData[key])rmFollowupsData[key]=r;
    });
  }).catch(function(){});
}

function loadReceivedLeads(){
  return sbFetch("GET","received_leads?week_key=eq."+weekKey+"&select=id,agent_name,lp,logged_date,buyer_name&limit=500").then(function(res){
    receivedLeadsData={};
    if(res)res.forEach(function(r){
      var obj={id:r.id,logged_date:r.logged_date,buyer_name:r.buyer_name,lp:r.lp};
      receivedLeadsData[r.agent_name.toUpperCase()]=obj;
      receivedLeadsData[ctAgentNameKey(r.agent_name).toUpperCase()]=obj;
    });
  }).catch(function(){});
}

function logReceivedLead(name,lp,btn){
  var existing=receivedLeadsData[name.toUpperCase()];
  if(existing){
    if(!confirm("Remove the received lead logged for "+name+"?"))return;
    // Optimistically update UI immediately so it doesn't feel stuck
    delete receivedLeadsData[name.toUpperCase()];
    updateReceivedLeadBtn(btn,name,false,null);
    sbFetch("DELETE","received_leads?id=eq."+existing.id).catch(function(){
      // Revert on failure
      receivedLeadsData[name.toUpperCase()]=existing;
      updateReceivedLeadBtn(btn,name,true,existing.buyer_name||null);
    });
  } else {
    var buyerName=prompt("Buyer name (optional — press OK to skip):")||"";
    var data={agent_name:name,lp:lp,logged_date:localDateStr(TODAY),week_key:weekKey,buyer_name:buyerName||null,note:""};
    sbFetch("POST","received_leads",data).then(function(res){
      var saved=res&&res.length?res[0]:{};
      var leadDate=localDateStr(TODAY);
      receivedLeadsData[name.toUpperCase()]={id:saved.id,logged_date:leadDate,buyer_name:buyerName,lp:lp};
      updateReceivedLeadBtn(btn,name,true,buyerName);
      selfReportedReferrals[name]=(selfReportedReferrals[name]||0)+1;

      // v30: an LP-confirmed received lead is an immediate shared business signal.
      // Update the live in-memory roster and shared profile so LP + RM health agree now,
      // instead of waiting for the next Power BI / Velocify import.
      var row=agents.find(function(a){return ctAgentNameKey(a[0])===ctAgentNameKey(name);});
      if(row&&(!row[3]||leadDate>row[3]))row[3]=leadDate;
      var v=getVelocifyForAgent(name)||{total:0,mtd:0};
      v.last_lead_date=(!v.last_lead_date||leadDate>v.last_lead_date)?leadDate:v.last_lead_date;
      v.total=Math.max(1,Number(v.total||0)+1);
      VELOCIFY_SEED[String(name||"").trim().toUpperCase()]=v;
      rebuildVelocifyMatch();
      sbFetch("PATCH","agent_profiles?agent_name=ilike."+encodeURIComponent(name),{latest_lead_date:leadDate}).catch(function(){
        // Non-critical: RM also reads received_leads directly in v67+, so the signal is not lost.
      });
      if(typeof renderLP==="function"&&currentUser===lp)renderLP(lp);
    }).catch(function(){});
  }
}

function updateReceivedLeadBtn(btn,name,isReceived,buyerName){
  if(!btn)return;
  btn.className="received-lead-btn"+(isReceived?" is-received":"");
  btn.innerHTML=isReceived
    ?'<span style="font-size:16px">&#127919;</span><span>Lead received'+(buyerName?" &#8212; "+escHtml(buyerName):"")+' &#10003;</span>'
    :'<span style="font-size:16px">&#127919;</span><span>Received a lead from this agent?</span>';
}

var lpHistoryCallCounts={};
function loadAgentFirstCalls(){
  return Promise.all([
    sbFetch("GET","agent_call_summary?select=agent_name,first_call_date,last_call_date,total_calls"),
    sbFetch("GET","lp_call_history_counts?select=lp,call_count")
  ]).then(function(results){
    var summary=results[0]||[];
    var lpCounts=results[1]||[];
    agentFirstCall={};
    agentLastCall={};
    lpHistoryCallCounts={};
    summary.forEach(function(r){
      agentFirstCall[r.agent_name]=r.first_call_date;
      agentLastCall[r.agent_name]=r.last_call_date;
    });
    lpCounts.forEach(function(r){
      lpHistoryCallCounts[r.lp]=r.call_count;
    });
  }).catch(function(err){console.warn("Agent first-call summary load failed:",err);});
}

function upsertCallLogWithOutcome(name,lp,note,outcome,flagRm){
  var id=name+"__"+weekKey;
  var fr=flagRm!==undefined?flagRm:(callLogs[name]?callLogs[name].flag_rm||false:false);
  var data={id:id,agent_name:name,lp:lp,week_key:weekKey,call_date:localDateStr(TODAY),note:note||"",outcome:outcome||"",flag_rm:fr};
  callLogs[name]=data;
  setSyncStatus("saving");
  return sbFetch("POST","call_logs",data).then(function(){
    return sbFetch("POST","call_logs_history",{agent_name:name,lp:lp,week_key:weekKey,call_date:localDateStr(TODAY),note:note||"",flag_rm:fr});
  }).then(function(){
    // A real LP connection is shared relationship history. Stamp the shared profile so the RM
    // tracker immediately treats it as the team's latest meaningful touch. Attempts do not stamp it.
    if(lpHasLiveConnectionLog(data)){
      return lpProfileWrite("PATCH","agent_profiles?agent_name=ilike."+encodeURIComponent(name),{last_meaningful_contact_date:localDateStr(TODAY)}).catch(function(err){console.warn("Shared meaningful-contact stamp skipped:",err);});
    }
  }).then(function(){setSyncStatus("live");}).catch(function(e){lpHandleSyncError(e);console.error("Call log save failed for "+name+":",e);});
}

function toggleRmFlag(btn){
  var name=btn.getAttribute("data-name"),lp=btn.getAttribute("data-lp");
  var log=callLogs[name];var cur=log?log.flag_rm||false:false;var newFlag=!cur;
  if(callLogs[name])callLogs[name].flag_rm=newFlag;
  // Direct DOM update — no renderLP, no scroll jump
  btn.className="rm-flag-btn"+(newFlag?" is-flagged":"");
  var iconEl=btn.querySelector(".rm-flag-icon");
  var txtEl=btn.querySelector("span:last-child");
  if(iconEl)iconEl.textContent=newFlag?"🚩":"🏳️";
  if(txtEl)txtEl.textContent=newFlag?"RM flagged":"Needs RM";
  upsertCallLogWithOutcome(name,lp,log?log.note||"":"",log?log.outcome||"":"",newFlag).catch(function(){});
}

function togglePendingRmFlag(btn){
  var name=btn.getAttribute("data-name");
  if(!pendingNote[name])pendingNote[name]={draft:"",outcome:""};
  var flagged=!pendingNote[name].flagRm;
  pendingNote[name].flagRm=flagged;
  btn.className="rm-flag-btn"+(flagged?" is-flagged":"");
  btn.querySelector(".rm-flag-icon").textContent=flagged?"\uD83D\uDEA9":"\uD83C\uDFF3\uFE0F";
  btn.querySelector("span:last-child").textContent=flagged?"RM flagged":"Needs RM";
}

function renderVelocifyLeaderboard(){
  var el=document.getElementById("velocify-leaderboard");
  if(!el)return;
  var sorted=Object.entries(VELOCIFY_SEED).filter(function(e){return e[1].total>0;}).sort(function(a,b){return(b[1].mtd-a[1].mtd)||(b[1].total-a[1].total);}).slice(0,10);
  if(!sorted.length){el.innerHTML='<div style="text-align:center;padding:1.5rem;color:#aaa;font-size:13px">No Velocify data yet &#8212; Zap will populate this automatically</div>';return;}
  var medals=["&#127947;","&#127948;","&#127949;","4.","5.","6.","7.","8.","9.","10."];
  el.innerHTML=sorted.map(function(e,i){
    var ag=agents.find(function(a){return a[0]===e[0];});
    var lp=ag?ag[2]:"",lvl=ag?ag[1]:"C";
    return'<div class="vel-row" data-team-agent="'+escHtml(e[0]).replace(/"/g,'&quot;')+'" role="button" tabindex="0" title="Open '+escHtml(e[0]).replace(/"/g,'&quot;')+' lead detail"><span class="vel-medal">'+medals[i]+'</span><div style="flex:1"><div style="font-weight:700;font-size:13px">'+escHtml(e[0])+' <span class="badge badge-'+lvl.toLowerCase()+'">'+lvl+'</span></div><div style="font-size:11px;color:#aaa;margin-top:2px">'+(lp?'&#8594; '+escHtml(lp):'')+'</div></div><div class="vel-cols"><div class="vel-col"><div class="vel-col-num'+(e[1].wtd===0?' zero':'')+'">'+( e[1].wtd||'&#8212;')+'</div><div class="vel-col-lbl">WTD</div></div><div class="vel-col"><div class="vel-col-num'+(e[1].mtd===0?' zero':'')+'">'+( e[1].mtd||'&#8212;')+'</div><div class="vel-col-lbl">MTD</div></div><div class="vel-col"><div class="vel-col-num">'+e[1].total+'</div><div class="vel-col-lbl">Total</div></div></div></div>';
  }).join("");
}

function ctOpenLeaderboardAgent(name){
  var d=VELOCIFY_SEED[name];if(!d||typeof window.pfrShowDetail!=='function')return;
  window.pfrShowDetail(name+' · referral leads',Number(d.wtd||0)+' this week · '+Number(d.mtd||0)+' this month · '+Number(d.total||0)+' total. Source: loaded Velocify agent lead summary; individual lead records are not included.',d.last_lead_date?[{name:'Latest referral',detail:String(d.last_lead_date)+(d.last_status?' · '+d.last_status:'')}]:[]);
}
document.addEventListener('click',function(e){
  var row=e.target.closest&&e.target.closest('[data-team-lp],[data-team-agent]');
  if(row){if(row.dataset.teamLp)ctOpenLeaderboardLp(row.dataset.teamLp);else ctOpenLeaderboardAgent(row.dataset.teamAgent);}
});
document.addEventListener('keydown',function(e){
  if(e.key!=='Enter'&&e.key!==' ')return;
  var row=e.target.closest&&e.target.closest('[data-team-lp],[data-team-agent]');
  if(row&&e.target===row){e.preventDefault();row.click();}
});

// ── Also add last_update column support — check for last_update or updated_at ──

// ── REFERRAL LEADS FUNCTIONS ──
var referralLeadsCache=null;

function getStatusBadgeClass(status){
  if(!status)return"rs-other";
  var s=status.toLowerCase();
  if(s.indexOf("withdrawn")>=0||s.indexOf("denied")>=0)return"rs-withdrawn";
  if(ctIsLeadAppConverted(status))return"rs-started";
  if(s.indexOf("contact attempt")>=0)return"rs-contact";
  if(s.indexOf("nurture")>=0)return"rs-nurture";
  if(s.indexOf("contacted")>=0)return"rs-contacted";
  return"rs-other";
}

var refFilters={status:"",lp:""};
var refSort={col:"",dir:1};
var refMetricDrilldown="";

function ctScrollLeadDetails(){
  setTimeout(function(){
    var s=document.getElementById("ref-filter-results-section-v2");
    if(s&&s.style.display!=="none")s.scrollIntoView({behavior:"smooth",block:"start"});
  },60);
}

function ctOpenLeadMetric(metric){
  refMetricDrilldown=metric||"";
  refFilters={status:"",lp:""};
  window._refFilters={status:[],lp:[]};
  document.querySelectorAll(".ref-filter-btn").forEach(function(b){
    b.style.outline="none";b.style.fontWeight="";
  });
  renderReferralLeadsDirect(referralLeadsCache||[]);
  ctScrollLeadDetails();
}

function toggleRefFilter(type,val,el){
  refMetricDrilldown="";
  if(refFilters[type]===val){refFilters[type]="";}
  else{refFilters[type]=val;}
  // Sync to _refFilters format used by standalone view
  window._refFilters={
    status:refFilters.status?[refFilters.status]:[],
    lp:refFilters.lp?[refFilters.lp]:[]
  };
  // Update visual state of ALL filter buttons (both Daniel + standalone views)
  document.querySelectorAll(".ref-filter-btn").forEach(function(b){
    b.style.outline="none";b.style.fontWeight="";
  });
  document.querySelectorAll(".ref-filter-btn").forEach(function(b){
    var bval=b.textContent.trim();
    var btype=b.classList.contains("lp-tag")?"lp":"status";
    if(refFilters[btype]&&bval.toLowerCase().indexOf(refFilters[btype].toLowerCase())>=0){
      b.style.outline="2px solid var(--navy)";b.style.outlineOffset="2px";b.style.fontWeight="700";
    }
  });
  // Render into whichever view is active
  if(currentUser==="Leads" || (document.getElementById("view-leads")&&document.getElementById("view-leads").classList.contains("active"))){
    renderReferralLeadsDirect(referralLeadsCache||[]);
  } else {
    renderReferralLeads(referralLeadsCache||[]);
  }
  if(refFilters.status||refFilters.lp)ctScrollLeadDetails();
}

function clearRefFilters(){
  refMetricDrilldown="";
  refFilters={status:"",lp:""};
  window._refFilters={status:[],lp:[]};
  document.querySelectorAll(".ref-filter-btn").forEach(function(b){
    b.style.outline="none";b.style.fontWeight="";
  });
  if(currentUser==="Leads" || (document.getElementById("view-leads")&&document.getElementById("view-leads").classList.contains("active"))){
    renderReferralLeadsDirect(referralLeadsCache||[]);
  } else {
    renderReferralLeads(referralLeadsCache||[]);
  }
}

function sortRefTable(col){
  if(refSort.col===col)refSort.dir*=-1;
  else{refSort.col=col;refSort.dir=1;}
  renderReferralLeads(referralLeadsCache||[]);
}

function applyRefFilters(data){
  var d=data;
  if(refFilters.status){
    var sf=refFilters.status.toLowerCase();
    d=d.filter(function(r){
      var s=(r.status||"").toLowerCase();
      if(sf==="converted to app")return ctIsLeadAppConverted(r);
      if(sf==="contact attempt")return s.indexOf("contact attempt")>=0;
      if(sf==="nurture")return s.indexOf("nurture")>=0;
      if(sf==="contacted")return s==="contacted";
      if(sf==="app withdrawn")return s.indexOf("withdrawn")>=0;
      if(sf==="other")return !ctIsLeadAppConverted(r)&&["contact attempt","nurture","contacted","withdrawn"].every(function(k){return s.indexOf(k)<0;});
      return true;
    });
  }
  if(refFilters.lp){
    d=d.filter(function(r){
      return(r.lp_user||"").toLowerCase().indexOf(refFilters.lp.toLowerCase())>=0;
    });
  }
  return d;
}

function applyRefSort(data){
  if(!refSort.col)return data;
  return data.slice().sort(function(a,b){
    var va,vb;
    if(refSort.col==="days"){
      var lu_a=a.last_update||a.date_added;var lu_b=b.last_update||b.date_added;
      va=lu_a?Math.floor((new Date()-new Date(lu_a+"T00:00:00"))/86400000):9999;
      vb=lu_b?Math.floor((new Date()-new Date(lu_b+"T00:00:00"))/86400000):9999;
    } else if(refSort.col==="agent"){
      va=(a.referral_partner_name||"").toLowerCase();
      vb=(b.referral_partner_name||"").toLowerCase();
      return refSort.dir*(va<vb?-1:va>vb?1:0);
    } else if(refSort.col==="status"){
      va=(a.status||"").toLowerCase();vb=(b.status||"").toLowerCase();
      return refSort.dir*(va<vb?-1:va>vb?1:0);
    } else {return 0;}
    return refSort.dir*(va-vb);
  });
}

function renderReferralLeads(data){
  var todayStr=localDateStr(TODAY);
  var priorDay=new Date(TODAY);priorDay.setDate(TODAY.getDate()-1);
  var priorStr=localDateStr(priorDay);

  function isFileStarted(status){
    return ctIsLeadAppConverted(status);
  }
  function isOverdue(r){
    if(ctInitialOutreachComplete(r)||ctIsLeadResolved(r))return false;
    var s=(r.status||"").toLowerCase();
    if(s.indexOf("nurture")>=0)return false;
    var lu=r.last_action_date||r.last_update||r.date_added;
    if(!lu)return true;
    var hrs=(new Date()-new Date(lu+"T00:00:00"))/3600000;
    return hrs>24;
  }

  var todayLeads=data.filter(function(r){return r.date_added===todayStr;});
  var priorLeads=data.filter(function(r){return r.date_added===priorStr;});
  var uncovered=data.filter(function(r){return!isFileStarted(r.status);});
  var needsTouch=data.filter(function(r){return isOverdue(r);});
  var mtdTotal=data.length;
  var mtdFileStarts=data.filter(function(r){return isFileStarted(r.status);}).length;
  var ltf=mtdTotal>0?Math.round(mtdFileStarts/mtdTotal*1000)/10:0;

  function setEl(id,val){var e=document.getElementById(id);if(e)e.textContent=val;}
  function setHtml(id,val){var e=document.getElementById(id);if(e)e.innerHTML=val;}

  setEl("ref-mtd-leads",mtdTotal||"0");
  setEl("ref-file-starts",mtdFileStarts||"0");
  setEl("ref-ltf",ltf+"%");
  setEl("ref-needs-touch",needsTouch.length||"0");
  setEl("ref-today-label",TODAY.toLocaleDateString("en-US",{month:"short",day:"numeric"}));
  setEl("ref-prior-label",priorDay.toLocaleDateString("en-US",{month:"short",day:"numeric"}));
  setEl("ref-today-count",todayLeads.length+" lead"+(todayLeads.length!==1?"s":""));
  setEl("ref-prior-day-count",priorLeads.length+" lead"+(priorLeads.length!==1?"s":""));
  setEl("ref-uncovered-count",uncovered.length+" lead"+(uncovered.length!==1?"s":""));
  setEl("ref-needs-touch-count",needsTouch.length+" lead"+(needsTouch.length!==1?"s":""));

  var ntSection=document.getElementById("ref-needs-touch-section");
  if(ntSection)ntSection.style.display=needsTouch.length?"block":"none";
  var badge=document.getElementById("d-tab-badge");
  if(badge){badge.textContent=needsTouch.length?needsTouch.length+" urgent":"";badge.style.display=needsTouch.length?"inline":"none";}

  var filteredNeeds=applyRefSort(applyRefFilters(needsTouch));
  var filteredToday=applyRefSort(applyRefFilters(todayLeads));
  var filteredPrior=applyRefSort(applyRefFilters(priorLeads));
  var filteredUncovered=applyRefSort(applyRefFilters(uncovered));
  setHtml("ref-needs-touch-table",buildLeadsTable(filteredNeeds,"No overdue leads.",true));
  setHtml("ref-today-table",buildLeadsTable(filteredToday,"No leads received today yet.",false));
  setHtml("ref-prior-table",buildLeadsTable(filteredPrior,"No leads on prior day.",false));
  setHtml("ref-uncovered-table",buildLeadsTable(filteredUncovered,"No unconverted leads — great conversion!",false));
}

function buildLeadsTable(rows,emptyMsg,showUrgency){
  if(!rows||!rows.length)return'<div class="ref-empty">'+emptyMsg+'</div>';

  function noteInfo(r){
    var note=r.last_action_note||"";
    if(!note.trim())return{cls:"missing",text:"No note logged",flag:"MISSING"};
    // No minimum word count. Only flag obviously repetitive/filler notes.
    if(typeof ctIsRepetitive==="function"&&ctIsRepetitive(note))return{cls:"lazy",text:escHtml(note),flag:"NEEDS DETAIL"};
    return{cls:"good",text:escHtml(note.length>70?note.substring(0,70)+"...":note),flag:""};
  }
  function dayInfo(r){
    var lu=r.last_action_date||r.last_update||r.date_added;
    if(!lu)return{days:null,label:"--",cls:"color:var(--text-3)"};
    var days=Math.floor((new Date()-new Date(lu+"T00:00:00"))/86400000);
    var date=new Date(lu+"T12:00:00").toLocaleDateString("en-US",{month:"numeric",day:"numeric"});
    if(days===0)return{days:0,label:"Today",date:date,cls:"color:var(--green)"};
    if(days<=2)return{days:days,label:days+"d ago",date:date,cls:"color:#8C7355"};
    return{days:days,label:days+"d ago",date:date,cls:"color:var(--red);font-weight:700"};
  }
  function lpTag(r){
    var lp=r.lp_user||"--";
    LPS.forEach(function(n){if(lp.toLowerCase().indexOf(n.toLowerCase())>=0)lp=n;});
    var lpKey=LPS.find(function(n){return lp===n;});
    return lpKey?'<span class="lp-tag lp-tag-'+lpKey+'">'+lpKey+'</span>':'<span style="font-size:11px;color:var(--text-3)">'+escHtml(lp)+'</span>';
  }

  // ── MOBILE CARDS ──
  var cards='<div class="lead-card-view">';
  rows.forEach(function(r){
    var ni=noteInfo(r),di=dayInfo(r);
    var isOvd=showUrgency&&di.days!==null&&di.days>=1;
    var badgeCls=getStatusBadgeClass(r.status||"");
    cards+='<div class="lead-card'+(isOvd?" overdue":"")+'">';
    cards+='<div class="lead-card-top">';
    cards+='<div class="lead-card-name">'+escHtml(r.referral_partner_name||"--")+'<div style="font-size:12px;font-weight:400;color:var(--text-2);margin-top:2px">'+escHtml(r.buyer_name||"--")+'</div></div>';
    cards+='<div class="lead-card-days" style="'+di.cls+'">'+di.label+'</div>';
    cards+='</div>';
    cards+='<div class="lead-card-meta">'+lpTag(r)+'<span class="ref-badge '+badgeCls+'">'+escHtml(r.status||"--")+'</span></div>';
    cards+='<div class="lead-card-note '+ni.cls+'">';
    if(ni.flag)cards+='<span style="font-size:9px;font-weight:700;margin-right:5px;text-transform:uppercase">'+ni.flag+'</span>';
    cards+=ni.text;
    cards+='</div></div>';
  });
  cards+='</div>';

  // ── DESKTOP TABLE ──
  var sortArrow=function(col){return refSort.col===col?(refSort.dir===1?" ↑":" ↓"):" ↕";};
  var table='<div class="ref-leads-table-wrap"><table class="ref-leads-table"><thead><tr>'
    +'<th style="cursor:pointer" onclick="sortRefTable(\'agent\')">Agent'+sortArrow("agent")+'</th>'
    +'<th>Buyer</th><th>LP</th>'
    +'<th style="cursor:pointer" onclick="sortRefTable(\'status\')">Status'+sortArrow("status")+'</th>'
    +'<th>LP Note</th>'
    +'<th style="cursor:pointer" onclick="sortRefTable(\'days\')">Last touch'+sortArrow("days")+'</th>'
    +(showUrgency?'<th style="cursor:pointer" onclick="sortRefTable(\'days\')">Days out'+sortArrow("days")+'</th>':'')
    +'</tr></thead><tbody>';
  rows.forEach(function(r){
    var ni=noteInfo(r),di=dayInfo(r);
    var isOvd=showUrgency&&di.days!==null&&di.days>=1;
    var badgeCls=getStatusBadgeClass(r.status||"");
    var noteFlagHtml=ni.flag?'<span style="font-size:9px;font-weight:700;margin-left:5px;padding:1px 5px;border-radius:3px;background:'+(ni.cls==="missing"?"var(--red-light)":"var(--amber-bg)")+';color:'+(ni.cls==="missing"?"var(--red)":"var(--amber)")+'">'+ni.flag+'</span>':"";
    table+='<tr class="'+(isOvd?"overdue":"")+'">';
    table+='<td style="font-weight:600;font-size:13px">'+escHtml(r.referral_partner_name||"--")+'</td>';
    table+='<td style="font-size:12px;color:var(--text-2)">'+escHtml(r.buyer_name||"--")+'</td>';
    table+='<td>'+lpTag(r)+'</td>';
    table+='<td><span class="ref-badge '+badgeCls+'">'+escHtml(r.status||"--")+'</span></td>';
    table+='<td style="font-size:11px;'+(ni.cls==="missing"?"color:var(--red);font-style:italic":ni.cls==="lazy"?"color:#8C7355":"color:var(--text-2)")+'">'+ni.text+noteFlagHtml+'</td>';
    table+='<td style="font-size:12px;'+di.cls+'">'+di.date+'<br><span style="font-size:10px">'+di.label+'</span></td>';
    if(showUrgency)table+='<td style="font-size:12px;'+di.cls+'">'+di.label+'</td>';
    table+='</tr>';
  });
  table+='</tbody></table></div>';

  return cards+table;
}



/* automatic 30-second dashboard repaint retired; Refresh/save actions are authoritative */
document.getElementById("weekPill").textContent=getWeekLabel(weekKey);
// Pause auto-refresh while user is typing in any input or textarea
document.addEventListener("focusin",function(e){if(e.target.tagName==="TEXTAREA"||e.target.tagName==="INPUT"){userTyping=true;}});
document.addEventListener("focusout",function(e){if(e.target.tagName==="TEXTAREA"||e.target.tagName==="INPUT"){userTyping=false;}});
// ── Near-real-time refresh for shared agent_profiles data (Phase 2 architecture pass) ──────
// There are no Supabase Realtime (push) subscriptions here — turning those on requires a
// database-side change (adding this table to the `supabase_realtime` publication), which is
// outside a no-schema/no-database-change pass and was intentionally NOT done. The 30-second
// poll above already keeps call_logs (LP activity) fresh; contact info (phone/email/tier/
// birthday from agent_profiles) is cached per-agent the first time it's looked up and, before
// this, never refreshed again in the same session — so a phone number Amanda updates wouldn't
// show up here until the page was reloaded. This clears that cache periodically instead, so the
// next time any agent card is viewed it refetches fresh — typically within a couple of minutes
// of a change, not instantly, and never while someone's actively typing or has the contact
// modal open.
/* periodic contact-cache timer retired */
document.addEventListener("visibilitychange",function(){
  if(!document.hidden&&!userTyping&&!editingLpContact)contactCache={};
});
// ── Shared RM/LP/DIRECTOR data refresh ──────────────────────────────────────────────────────
// LP uploads the authoritative Power BI profile snapshot. All trackers read the same shared
// Supabase tables. Realtime pushes refresh immediately when publication is enabled; a 60-second
// shared-table poll covers missed events and environments where a table is not in the publication.
var _sharedRealtimeTimer=null,_sharedPollTimer=null;
async function refreshLpSharedData(source){
  if(userTyping||editingLpContact)return;
  clearTimeout(_sharedRealtimeTimer);
  _sharedRealtimeTimer=setTimeout(async function(){
    try{
      var poll=source==="poll",allActivity=poll||["call_logs","lp_flags","amanda_activities","rm_lp_flags","rm_followups","break_breads"].indexOf(source)>=0;
      // A completed Power BI import changes the entire roster, not only the dashboard.
      // Clear all derived summaries on import-log events and on the 60-second fallback poll.
      if(source==="agent_profiles"||source==="powerbi_import_log"||poll){
        contactCache={};loadAgents();
        if(typeof window.ctInvalidateLivePowerBi==="function")window.ctInvalidateLivePowerBi();
        if(typeof window.ctHydrateSharedPowerBiSnapshot==="function")await window.ctHydrateSharedPowerBiSnapshot().catch(function(e){ctPowerBiWarning('Some sections could not refresh: '+(e&&e.message||'Request failed'));console.warn('LP shared section refresh failed',e);});
      }
      if(source==="agent_assignments"||source==="powerbi_import_log"||poll)await loadAgentAssignments().catch(function(e){ctPowerBiWarning('Some sections could not refresh: '+(e&&e.message||'Request failed'));console.warn('LP shared section refresh failed',e);});
      if(allActivity){
        await Promise.all([
          loadCallLogs().catch(function(e){ctPowerBiWarning('Some sections could not refresh: '+(e&&e.message||'Request failed'));console.warn('LP shared section refresh failed',e);}),
          loadRmActivity().catch(function(e){ctPowerBiWarning('Some sections could not refresh: '+(e&&e.message||'Request failed'));console.warn('LP shared section refresh failed',e);}),
          loadRmFollowups().catch(function(e){ctPowerBiWarning('Some sections could not refresh: '+(e&&e.message||'Request failed'));console.warn('LP shared section refresh failed',e);}),
          loadAmandaSnapshot().catch(function(e){ctPowerBiWarning('Some sections could not refresh: '+(e&&e.message||'Request failed'));console.warn('LP shared section refresh failed',e);}),
          loadFaceTime().catch(function(e){ctPowerBiWarning('Some sections could not refresh: '+(e&&e.message||'Request failed'));console.warn('LP shared section refresh failed',e);})
        ]);
      }
      var snapshotView=document.getElementById("view-snapshot");
      if(snapshotView&&snapshotView.classList.contains("active")&&typeof window.lpLoadSnapshotFresh==="function"){
        await window.lpLoadSnapshotFresh({force:true}).catch(function(e){ctPowerBiWarning('Some sections could not refresh: '+(e&&e.message||'Request failed'));console.warn('LP shared section refresh failed',e);});
      }else if(!poll&&["Gavin","Karen","Osgood","Jordan","Said","Isaak"].indexOf(currentUser)>=0&&Object.keys(pendingNote).length===0){
        renderLP(currentUser);
      }
      // Re-query the Partner Growth page after every new import (and on polling).
      var partnerGrowth=document.getElementById("view-partner-growth");
      if(partnerGrowth&&partnerGrowth.classList.contains("active")&&typeof window.ctRenderTierOpportunities==="function"){
        await window.ctRenderTierOpportunities().catch(function(e){console.warn("Partner Growth refresh failed:",e);});
      }
      var pfr=document.getElementById("view-portfolio");
      if(pfr&&pfr.classList.contains("active")&&typeof window.pfrLoad==="function")window.pfrLoad().catch(function(e){ctPowerBiWarning('Some sections could not refresh: '+(e&&e.message||'Request failed'));console.warn('LP shared section refresh failed',e);});
      var pm=document.getElementById("view-production-manager");
      if(pm&&pm.classList.contains("active")&&typeof window.pmLoad==="function")window.pmLoad(true).catch(function(e){ctPowerBiWarning('Some sections could not refresh: '+(e&&e.message||'Request failed'));console.warn('LP shared section refresh failed',e);});
      if((source==="lp_flags"||source==="rm_lp_flags"||source==="call_logs"||poll)&&typeof window.ctLoadNotifications==="function")window.ctLoadNotifications();
    }catch(e){ctPowerBiWarning("Cross-tracker shared-data refresh failed: "+(e&&e.message||"Request failed"));console.warn("Cross-tracker shared-data refresh failed:",e);}
  },180);
}
function startSharedDataPolling(){
  if(_sharedPollTimer)return;
  _sharedPollTimer=setInterval(function(){if(!document.hidden)refreshLpSharedData("poll")},60000);
}
function initRealtimeSync(){
  if(typeof window.supabase==="undefined"||!window.supabase.createClient){
    initRealtimeSync._tries=(initRealtimeSync._tries||0)+1;
    if(initRealtimeSync._tries<30){setTimeout(initRealtimeSync,500);return;}
    console.warn("Realtime: Supabase SDK did not load; shared-data polling remains active.");return;
  }
  try{
    var rtClient=window.supabase.createClient(SB_URL,SB_KEY),ch=rtClient.channel("core-team-shared-changes");
    ["agent_profiles","agent_assignments","lp_flags","rm_lp_flags","call_logs","amanda_activities","rm_followups","break_breads","tier_migrations","health_snapshots","lp_scorecards","powerbi_import_log"].forEach(function(table){
      ch=ch.on("postgres_changes",{event:"*",schema:"public",table:table},function(){refreshLpSharedData(table);});
    });
    ch.subscribe(function(status){
      if(status==="SUBSCRIBED"){window._coreTeamRealtimeSubscribed=true;console.log("Realtime: LP tracker connected to shared RM/LP/Director tables.");}
      else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"||status==="CLOSED"){window._coreTeamRealtimeSubscribed=false;console.warn("Realtime: shared-table push unavailable ("+status+"); 60-second polling remains active.");}
    });
    window._coreTeamRealtimeClient=rtClient;window._coreTeamRealtimeChannel=ch;
  }catch(e){window._coreTeamRealtimeSubscribed=false;console.warn("Realtime setup failed; shared-data polling remains active:",e.message);}
}
startSharedDataPolling();
initRealtimeSync();
document.addEventListener("visibilitychange",function(){if(!document.hidden)refreshLpSharedData("poll")});
/* realtime dashboard auto-repaint retired for stability */
loadAgents();
// Ownership is useful, but it no longer competes with the first connection/data paint.
setTimeout(function(){try{loadAgentAssignments();}catch(e){console.warn("LP ownership preload:",e);}},500);
// Auto-open Snapshot on load — v52 authoritative first paint.
(function(){
  var snapBtn=document.querySelector(".wb-Snapshot");
  currentUser="Snapshot";
  document.querySelectorAll(".view").forEach(function(v){v.classList.remove("active");});
  var snap=document.getElementById("view-snapshot");if(snap)snap.classList.add("active");
  document.querySelectorAll(".who-btn").forEach(function(b){b.classList.remove("active");});
  if(snapBtn)snapBtn.classList.add("active");
  // Do not render partially hydrated numbers. The loader owns the first paint.
  setTimeout(function(){
    if(typeof window.lpLoadSnapshotFresh==="function")window.lpLoadSnapshotFresh({force:true});
  },0);
})();

// ── TEAM-WIDE ROLLUP (Scorecards tab) ────────────────────────────────────
const LPSC_TEAM_LPS=["Gavin","Karen","Osgood","Said","Jordan","Isaak"];
var lpscTeamCurrentPeriod="daily",lpscTeamCache=null;

function lpscTeamPeriod(period,btn){
  document.querySelectorAll(".lpsc-period-btn").forEach(function(b){b.classList.remove("active");});
  if(btn)btn.classList.add("active");
  lpscTeamCurrentPeriod=period;
  lpscRenderTeamTotals();
}

async function lpscLoadTeamTotals(){
  var body=document.getElementById("lpsc-team-body");
  try{
    var now=new Date();
    var ytdStart=now.getFullYear()+"-01-01";
    var res=await fetch(
      SB_URL+"/rest/v1/lp_scorecards?person=in.("+LPSC_TEAM_LPS.join(",")+")&week_key=gte."+ytdStart+"&select=person,week_key,data",
      {headers:{apikey:SB_KEY,Authorization:"Bearer "+SB_KEY}}
    );
    lpscTeamCache=await res.json();
    lpscRenderTeamTotals();
  }catch(e){
    console.warn(e);
    body.innerHTML='<div style="text-align:center;padding:20px;color:#888;font-size:13px">Could not load team totals.</div>';
  }
}

function lpscRenderTeamTotals(){
  var body=document.getElementById("lpsc-team-body");
  if(!lpscTeamCache){body.innerHTML='<div style="text-align:center;padding:20px;color:#888;font-size:13px">Loading team totals...</div>';return;}
  var metrics=LPSC_METRICS_MAP._lp2;
  var period=lpscTeamCurrentPeriod;
  var now=new Date();
  var todayWk=lpscAmWeekKeyOf(localDateStr(now));
  var monthStart=now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-01";
  var todayDayName=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][now.getDay()];

  var rows=lpscTeamCache;
  if(period==="daily"){
    rows=rows.filter(function(r){return r.week_key===todayWk;});
  }else if(period==="mtd"){
    rows=rows.filter(function(r){return r.week_key>=monthStart;});
  }

  var TEAM_WEEKLY_GOALS={past_client_talks:50,referred_leads:80,apps_1003:50,pre_approvals:25,contracts:14};

  var cardsHtml="";
  metrics.forEach(function(m){
    var total=0;
    if(period==="daily"){
      rows.forEach(function(r){total+=parseInt((r.data||{})[m.key+"_"+todayDayName]||0)||0;});
    }else{
      rows.forEach(function(r){total+=lpscGetTotal(m.key,r.data);});
    }
    var weeklyTeamGoal=TEAM_WEEKLY_GOALS[m.key]!==undefined?TEAM_WEEKLY_GOALS[m.key]:(m.goal*LPSC_TEAM_LPS.length);
    var teamGoal=period==="daily"?Math.round(weeklyTeamGoal/5):
                  period==="mtd"?Math.round(weeklyTeamGoal*4.3):
                  Math.round(weeklyTeamGoal*52);
    var pct=teamGoal?Math.min(total/teamGoal,1):0;
    var color=pct>=1?"#2a7a3b":pct>=0.6?"#b8922a":"#9ca3af";
    cardsHtml+='<div style="background:#fff;border-radius:8px;border:1px solid var(--border);padding:14px;text-align:center">'
      +'<div style="font-size:20px;font-weight:700;color:'+color+'">'+total+'</div>'
      +'<div style="font-size:10px;color:#888;margin-top:2px;text-transform:uppercase;letter-spacing:.04em">'+m.label+'</div>'
      +'<div style="font-size:10px;color:#aaa;margin-top:1px">team goal '+teamGoal+'</div>'
      +'<div style="height:3px;background:#eee;border-radius:2px;margin-top:6px;overflow:hidden">'
      +'<div style="height:100%;width:'+Math.round(pct*100)+'%;background:'+color+';border-radius:2px"></div></div>'
      +'</div>';
  });

  body.innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px">'+cardsHtml+'</div>'
    +'<div style="font-size:10px;color:#aaa;margin-top:10px;text-align:center">'+(period==="daily"?"Today's combined activity":period==="mtd"?"Month-to-date combined activity":"Year-to-date combined activity")+' across Gavin, Karen, Osgood, Said, Jordan, and Isaak</div>';
}


var rmPollInterval=null,rmCoverageLastLoaded=0;





const LPSC_METRICS_MAP={
  Isaak:[
    {key:"apps_1003",label:"1003's",goal:10},
    {key:"realtor_calls",label:"Realtor calls",goal:100},
    {key:"meetings",label:"Realtor meetings scheduled",goal:10}
  ],
  _lp2:[
    
    {key:"referred_leads",label:"Referred leads",goal:16},
    {key:"apps_1003",label:"1003's",goal:13},
    {key:"pre_approvals",label:"Pre-approvals",goal:6},
    {key:"contracts",label:"Contracts",goal:3}
  ]
};
["Gavin","Osgood","Karen","Said","Jordan"].forEach(function(n){LPSC_METRICS_MAP[n]=LPSC_METRICS_MAP._lp2;});

const LPSC_AMANDA_GOALS=[
  {key:"New Realtor Meeting",label:"New partner meetings",goal:3,monthlyGoal:10},
  {key:"__existingmeeting__",label:"Existing partner meetings",goal:5,monthlyGoal:20},
  {key:"Cold Calls",label:"Cold calls",goal:125,monthlyGoal:500},
  {key:"Talk-to's",label:"Talk-to's",goal:100,monthlyGoal:400},
  {key:"Buddy Intro Received",label:"Buddy referral asks",goal:3,monthlyGoal:12}
];


const LPSC_DAYS=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const LPSC_CHART_COLORS=["#1F4E79","#b8922a","#2a7a3b","#c0392b","#8e44ad","#64748b"];
var lpscCurrentLP="Isaak",lpscCharts=[];
var lpscAmandaActsByWeek={};

function lpscSelectLP(name,btn){
  document.querySelectorAll(".lpsc-btn").forEach(function(b){b.classList.remove("active");});
  btn.classList.add("active");
  lpscCurrentLP=name;
  document.getElementById("lpsc-person-label").textContent=name+" — Weekly History";
  document.getElementById("lpsc-print-name").textContent=name+(name==="Amanda"?" Dearth":"")+" — Scorecard";
  document.getElementById("lpsc-daily-wrap").style.display="none";
  document.getElementById("lpsc-save-msg").textContent="";
  if(name==="Amanda"){
    lpscLoadAmanda();
    document.getElementById("lpsc-edit-wrap").style.display="none";
  }else{
    lpscLoad();
    document.getElementById("lpsc-edit-wrap").style.display="block";
    lpscEditMonday=lpscGetMonday(new Date());
    lpscLoadEditWeek();
  }
}

function lpscPrintScorecard(){
  if(!lpscCurrentLP){alert("Select a name first, then print their scorecard.");return;}
  window.print();
}

// ── EDITABLE SCORECARD (Scorecards tab) ──────────────────────────────────
var lpscEditMonday=null,lpscEditData={};

function lpscGetMonday(d){
  var dt=new Date(d),day=dt.getDay();
  dt.setDate(dt.getDate()+(day===0?-6:1-day));
  dt.setHours(0,0,0,0);
  return dt;
}
function lpscEditWeekKey(mon){
  return mon.getFullYear()+"-"+String(mon.getMonth()+1).padStart(2,"0")+"-"+String(mon.getDate()).padStart(2,"0");
}
function lpscEditFmtRange(mon){
  var sun=new Date(mon);sun.setDate(sun.getDate()+6);
  var o={month:"short",day:"numeric"};
  return mon.toLocaleDateString("en-US",o)+" – "+sun.toLocaleDateString("en-US",o);
}
function lpscEditPrevWeek(){
  lpscEditMonday.setDate(lpscEditMonday.getDate()-7);
  lpscLoadEditWeek();
}
function lpscEditNextWeek(){
  lpscEditMonday.setDate(lpscEditMonday.getDate()+7);
  lpscLoadEditWeek();
}

async function lpscLoadEditWeek(){
  var wk=lpscEditWeekKey(lpscEditMonday);
  document.getElementById("lpsc-edit-range").textContent=lpscEditFmtRange(lpscEditMonday);
  document.getElementById("lpsc-edit-label").textContent=lpscCurrentLP+" — Edit this week";
  document.getElementById("lpsc-edit-body").innerHTML='<div style="text-align:center;padding:20px;color:#888;font-size:13px">Loading...</div>';
  lpscEditData={};
  try{
    var res=await fetch(SB_URL+"/rest/v1/lp_scorecards?person=eq."+encodeURIComponent(lpscCurrentLP)+"&week_key=eq."+wk+"&select=data",
      {headers:{apikey:SB_KEY,Authorization:"Bearer "+SB_KEY}});
    var rows=await res.json();
    if(rows&&rows.length&&rows[0].data)lpscEditData=rows[0].data;
  }catch(e){console.warn(e);}
  lpscRenderEditTable();
}

function lpscRenderEditTable(){
  var metrics=LPSC_METRICS_MAP[lpscCurrentLP];
  var body=document.getElementById("lpsc-edit-body");
  var html='<table style="width:100%;border-collapse:collapse"><thead><tr>'
    +'<th style="text-align:left;padding:8px 10px;font-size:11px;color:#888;font-weight:600">Metric</th>';
  LPSC_DAYS.forEach(function(d){html+='<th style="text-align:center;padding:8px 10px;font-size:11px;color:#888;font-weight:600">'+d+'</th>';});
  html+='<th style="text-align:center;padding:8px 10px;font-size:11px;color:#888;font-weight:600">Total</th></tr></thead><tbody>';
  metrics.forEach(function(m){
    var total=lpscGetTotal(m.key,lpscEditData);
    html+='<tr><td style="padding:8px 10px;font-size:13px;font-weight:500;border-bottom:1px solid #f0f2f8">'+m.label+'</td>';
    LPSC_DAYS.forEach(function(day){
      var v=lpscEditData[m.key+"_"+day]||"";
      html+='<td style="padding:6px 8px;border-bottom:1px solid #f0f2f8;text-align:center"><input type="number" min="0" value="'+v+'" data-key="'+m.key+'" data-day="'+day+'" oninput="lpscEditInput(this)" style="width:48px;padding:6px;text-align:center;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit"></td>';
    });
    html+='<td id="lpsc-edit-total-'+m.key+'" style="padding:8px 10px;text-align:center;font-size:13px;font-weight:700;border-bottom:1px solid #f0f2f8">'+total+' <span style="font-size:10px;color:#aaa">/'+m.goal+'</span></td></tr>';
  });
  // TOTAL row across all metrics
  var goalSum=metrics.reduce(function(s,m){return s+m.goal;},0);
  html+='<tr style="background:#f8fafc"><td style="padding:9px 10px;font-size:13px;font-weight:800;border-top:2px solid #1F4E79">TOTAL</td>';
  LPSC_DAYS.forEach(function(day){
    var dayTot=metrics.reduce(function(s,m){return s+(parseInt(lpscEditData[m.key+"_"+day]||0)||0);},0);
    html+='<td style="padding:9px 8px;text-align:center;font-size:12px;font-weight:700;border-top:2px solid #1F4E79;color:#475569">'+(dayTot||"")+'</td>';
  });
  html+='<td id="lpsc-edit-grandtotal" style="padding:9px 10px;text-align:center;border-top:2px solid #1F4E79">'+lpscEditTotalCell(goalSum)+'</td></tr>';
  html+="</tbody></table>";

  // Mobile view uses the SAME inputs, data keys and save handler as the desktop table.
  var mobile='<div class="lpsc-mobile-cards">';
  metrics.forEach(function(m){
    var total=lpscGetTotal(m.key,lpscEditData);
    mobile+='<div class="lpsc-mobile-metric"><div class="lpsc-mobile-metric-head"><strong>'+m.label+'</strong><span id="lpsc-mobile-total-'+m.key+'">'+total+' / '+m.goal+'</span></div><div class="lpsc-mobile-days">';
    LPSC_DAYS.forEach(function(day){
      var val=lpscEditData[m.key+'_'+day];
      mobile+='<label><span>'+day+'</span><input aria-label="'+m.label+' '+day+'" type="number" min="0" inputmode="numeric" value="'+(val===undefined||val===null?'':val)+'" data-key="'+m.key+'" data-day="'+day+'" oninput="lpscMobileEditInput(this)"></label>';
    });
    mobile+='</div></div>';
  });
  mobile+='</div>';
  body.innerHTML='<div class="lpsc-desktop-editor">'+html+'</div>'+mobile;

}

function lpscMobileEditInput(input){
  var key=input.getAttribute('data-key'),day=input.getAttribute('data-day');
  var field=key+'_'+day;
  if(input.value==='')delete lpscEditData[field]; else lpscEditData[field]=Math.max(0,Number(input.value)||0);
  var metric=(LPSC_METRICS_MAP[lpscCurrentLP]||[]).find(function(m){return m.key===key});
  var total=lpscGetTotal(key,lpscEditData);
  var el=document.getElementById('lpsc-mobile-total-'+key);
  if(el)el.textContent=total+' / '+(metric?metric.goal:0);
  var msg=document.getElementById('lpsc-save-msg');if(msg)msg.textContent='Unsaved changes';
}

function lpscEditTotalCell(goalSum){
  var metrics=LPSC_METRICS_MAP[lpscCurrentLP];
  var tot=metrics.reduce(function(s,m){return s+lpscGetTotal(m.key,lpscEditData);},0);
  // For Isaak, use realtor_calls goal (100) as the primary target denominator
  var displayGoal=lpscCurrentLP==="Isaak"?100:goalSum;
  var displayTot=lpscCurrentLP==="Isaak"?lpscGetTotal("realtor_calls",lpscEditData):tot;
  var pct=displayGoal?displayTot/displayGoal:0;
  var color=pct>=1?"#1a5c2a":pct>=0.6?"#7a4f0a":"#555";
  var bg=pct>=1?"#dcf5e3":pct>=0.6?"#fef3dc":"#f0f0f0";
  return '<span style="display:inline-block;padding:4px 10px;border-radius:8px;font-size:14px;font-weight:800;background:'+bg+';color:'+color+'">'+tot+' / '+goalSum+' <span style="font-size:10px;font-weight:600">('+Math.round(pct*100)+'%)</span></span>';
}

function lpscEditInput(inp){
  var key=inp.getAttribute("data-key"),day=inp.getAttribute("data-day");
  var v=inp.value.trim();
  lpscEditData[key+"_"+day]=v===""?0:(parseInt(v)||0);
  var metrics=LPSC_METRICS_MAP[lpscCurrentLP];
  var m=metrics.filter(function(x){return x.key===key;})[0];
  if(m){
    var total=lpscGetTotal(key,lpscEditData);
    document.getElementById("lpsc-edit-total-"+key).innerHTML=total+' <span style="font-size:10px;color:#aaa">/'+m.goal+'</span>';
  }
  // refresh the TOTAL row (grand total + per-day column totals)
  var gt=document.getElementById("lpsc-edit-grandtotal");
  if(gt){var goalSum=metrics.reduce(function(s,x){return s+x.goal;},0);gt.innerHTML=lpscEditTotalCell(goalSum);}
}

async function lpscSaveEdit(){
  var wk=lpscEditWeekKey(lpscEditMonday);
  var msgEl=document.getElementById("lpsc-save-msg");
  msgEl.textContent="Saving...";msgEl.style.color="#888";
  var cleanData={};
  Object.keys(lpscEditData).forEach(function(k){
    var v=lpscEditData[k];
    cleanData[k]=(v===""||v===null||v===undefined)?0:(parseInt(v)||0);
  });
  try{
    var res=await fetch(SB_URL+"/rest/v1/lp_scorecards?on_conflict=person,week_key",{
      method:"POST",
      headers:{apikey:SB_KEY,Authorization:"Bearer "+SB_KEY,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates"},
      body:JSON.stringify({person:lpscCurrentLP,week_key:wk,data:cleanData})
    });
    if(res.ok||res.status===201){
      msgEl.textContent="✓ Saved";msgEl.style.color="#1a6e35";
      lpscEditData=cleanData;
      lpscLoad();
    }else{
      var errText="";
      try{errText=await res.text();}catch(e2){}
      msgEl.textContent="Error "+res.status;msgEl.style.color="#c0392b";
      console.warn("lpscSaveEdit failed",res.status,errText);
    }
  }catch(e){msgEl.textContent="Could not save";msgEl.style.color="#c0392b";}
  setTimeout(function(){msgEl.textContent="";},3000);
}

// ── RELATIONSHIP MANAGER TAB (Amanda) ────────────────────────────────────
const RM_GOALS=[
  {label:"New realtor meeting",type:"New Realtor Meeting",daily:1,weekly:3,monthly:10},
  {label:"Cold calls",type:"Cold Calls",daily:25,weekly:125,monthly:500},
  {label:"Break breads",type:"Break Breads",daily:1,weekly:5,monthly:20},
  {label:"Talk-to's",type:"Talk-to's",daily:20,weekly:100,monthly:400},
  {label:"Buddy asks",type:"Realtor Buddy Referral Ask",daily:1,weekly:3,monthly:12}
];
var rmCurrentPeriod="today";

function rmWeekRange(){
  var now=new Date(),day=now.getDay();
  var mon=new Date(now);
  mon.setDate(now.getDate()-(day===0?6:day-1));
  mon.setHours(0,0,0,0);
  var sun=new Date(mon);sun.setDate(mon.getDate()+6);
  return{start:localDateStr(mon),end:localDateStr(sun)};
}





var rmFeedCache={today:[],week:[],mtd:[]};

async function rmLoadFeed(){
  var el=document.getElementById("rm-feed-list");
  try{
    var now=new Date(),todayStr=localDateStr(now);
    var week=rmWeekRange();
    var monthStart=now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-01";
    var res=await fetch(SB_URL+"/rest/v1/amanda_activities?act_date=gte."+monthStart+"&select=agent_name,act_type,outcome,act_date,notes&order=act_date.desc&limit=2000",
      {headers:{apikey:SB_KEY,Authorization:"Bearer "+SB_KEY}});
    var rows=await res.json();
    if(!res.ok||!Array.isArray(rows)){
      el.innerHTML='<div style="text-align:center;padding:20px;color:#888;font-size:13px">Could not load activity feed.</div>';
      return;
    }
    rows=rows.filter(function(r){return !lpIsInternalRmActivity(r);});
    rmFeedCache.mtd=rows;
    rmFeedCache.week=rows.filter(function(r){return r.act_date>=week.start&&r.act_date<=week.end;});
    rmFeedCache.today=rows.filter(function(r){return r.act_date===todayStr;});
    rmRenderFeed();
  }catch(e){
    console.warn(e);
    el.innerHTML='<div style="text-align:center;padding:20px;color:#888;font-size:13px">Could not load activity feed.</div>';
  }
}

function lpIsInternalRmActivity(a){
  var notes=String((a&&a.notes)||"");
  var type=String((a&&a.act_type)||"").toLowerCase();
  // Internal transaction triggers are machine-created must-do records.
  // They stay in Supabase for workflow logic but should never appear as human RM activity.
  if(notes.indexOf("[TXN_TRIGGER]")>=0)return true;
  if(type==="new contract"||type==="clear to close")return notes.indexOf("[TXN_")>=0;
  return false;
}



async function rmLoadGoals(){
  var body=document.getElementById("rm-goals-body");
  try{
    var now=new Date(),todayStr=localDateStr(now);
    var week=rmWeekRange();
    var monthStart=now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-01";
    var res=await fetch(SB_URL+"/rest/v1/amanda_activities?act_date=gte."+monthStart+"&select=act_type,act_date",
      {headers:{apikey:SB_KEY,Authorization:"Bearer "+SB_KEY}});
    var acts=await res.json();
    rmActsCache={acts:acts,todayStr:todayStr,week:week,monthStart:monthStart};
    rmRenderGoals();
  }catch(e){
    console.warn(e);
    body.innerHTML='<div style="text-align:center;padding:20px;color:#888;font-size:13px">Could not load goals.</div>';
  }
}

var rmActsCache=null;



function openRmFollowupForm(btn){
  var agentName=btn.getAttribute("data-agent");
  var lp=btn.getAttribute("data-lp");
  var rid=btn.getAttribute("data-rid");
  var row=btn.closest("[style*='padding:10px 16px']")||btn.parentNode.parentNode;
  var today=new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"});
  var fh='<div style="padding:10px 16px;border-bottom:1px solid #f1f5f9;background:#f8fafc">'
    +'<div style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:8px">Log RM follow-up for '+escHtml(agentName)+'</div>'
    
    +'<textarea id="fu-note-'+rid+'" placeholder="What did the RM do? (e.g. called, met for coffee, sent market update...)" style="width:100%;padding:6px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;min-height:70px;font-family:inherit;resize:vertical;box-sizing:border-box"></textarea>'
    +'<div style="display:flex;gap:6px;margin-top:6px">'
    +'<button data-agent="'+escHtml(agentName)+'" data-lp="'+escHtml(lp)+'" data-rid="'+rid+'" onclick="saveRmFollowup(this)" style="background:#1F4E79;color:#fff;border:none;border-radius:6px;padding:6px 14px;font-size:12px;cursor:pointer;font-family:inherit">Save &amp; notify LP</button>'
    +'<button onclick="document.getElementById(\'rm-flagged-panel\').style.display=\'none\'" style="background:none;border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;font-size:12px;cursor:pointer;color:#64748b;font-family:inherit">Cancel</button>'
    +'</div></div>';
  if(row)row.outerHTML=fh;
}

function rmClearFlag(id){
  if(!id)return;
  sbFetch("PATCH","rm_followups?id=eq."+encodeURIComponent(id),{flagged:false})
    .then(function(){loadRmFollowups();rmLoadFlagged();})
    .catch(function(){});
}


function saveRmFollowup(btn){
  var agentName=btn.getAttribute("data-agent");
  var lp=btn.getAttribute("data-lp");
  var rid=btn.getAttribute("data-rid");
  var noteEl=document.getElementById("fu-note-"+rid);
  var typeEl=document.getElementById("fu-type-"+rid);
  var note=noteEl?noteEl.value.trim():"";
  var actType=typeEl?typeEl.value:"Agent visit";
  if(!note){if(noteEl){noteEl.style.borderColor="#dc2626";}return;}
  btn.textContent="Saving...";btn.disabled=true;
  sbFetch("POST","rm_followups",{agent_name:agentName,lp:lp,amanda_note:note,followup_date:localDateStr(TODAY),activity_type:actType}).then(function(){
    if(rid)sbFetch("PATCH","call_logs?id=eq."+encodeURIComponent(rid),{flag_rm:false}).catch(function(){});
    rmFollowupsData[agentName.toUpperCase()]={agent_name:agentName,lp:lp,amanda_note:note,followup_date:localDateStr(TODAY),activity_type:actType};
    var panel=document.getElementById("rm-flagged-panel");
    if(panel)panel.style.display="none";
    rmLoadFlagged();
    // Refresh LP view so banner appears
    // Only re-render LP if no pending notes open (to avoid clearing in-progress work)
    if(currentUser&&currentUser!=="Daniel"&&currentUser!=="Leads"&&currentUser!=="Admin"&&Object.keys(pendingNote).length===0)renderLP(currentUser);
    // Show toast
    var toast=document.createElement("div");
    toast.style.cssText="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1F4E79;color:#fff;padding:10px 20px;border-radius:20px;font-size:13px;font-weight:600;z-index:999;box-shadow:0 4px 12px rgba(0,0,0,.15)";
    toast.textContent="Follow-up saved \u2014 "+agentName+" notified to LP";
    document.body.appendChild(toast);
    setTimeout(function(){if(toast.parentNode)toast.parentNode.removeChild(toast);},3000);
  }).catch(function(){btn.textContent="Save & notify LP";btn.disabled=false;});
}

function toggleCoveragePanel(){
  var panel=document.getElementById("rm-coverage-panel");
  if(!panel)return;
  var isOpen=panel.style.display!=="none";
  if(isOpen){panel.style.display="none";return;}
  panel.style.display="block";
  var listEl=document.getElementById("rm-coverage-list");
  // Recompute who is uncovered
  var week=rmWeekRange();
  Promise.all([
    // HOTFIX: was select=agent_name with no filter — same fix as rmLoadCoverage() above, and
    // the direct cause of a removed agent (e.g. soft-deleted via do_not_contact:true) still
    // showing up here as "No visits on record."
    fetch(SB_URL+"/rest/v1/agent_profiles?select=agent_name,relationship_status&do_not_contact=neq.true&relationship_status=neq.inactive&order=agent_name.asc&limit=500",{headers:{apikey:SB_KEY,Authorization:"Bearer "+SB_KEY}}).then(function(r){return r.json();}),
    fetch(SB_URL+"/rest/v1/amanda_activities?select=agent_name,act_date&act_date=lt."+week.start+"&order=act_date.desc&limit=3000",{headers:{apikey:SB_KEY,Authorization:"Bearer "+SB_KEY}}).then(function(r){return r.json();}),
    fetch(SB_URL+"/rest/v1/amanda_activities?select=agent_name&act_date=gte."+week.start+"&act_date=lte."+week.end,{headers:{apikey:SB_KEY,Authorization:"Bearer "+SB_KEY}}).then(function(r){return r.json();})
  ]).then(function(results){
    var allAgents=results[0],priorActs=results[1],weekActs=results[2];
    var lastSeen={};
    priorActs.forEach(function(a){var n=(a.agent_name||"").trim();if(n&&!lastSeen[n])lastSeen[n]=a.act_date;});
    var touchedThisWeek={};
    weekActs.forEach(function(a){var n=(a.agent_name||"").trim();if(n)touchedThisWeek[n]=true;});
    var mondayDate=new Date(week.start+"T12:00:00");
    var uncovered=allAgents.map(function(a){
      var name=(a.agent_name||"").trim();if(!name)return null;
      var last=lastSeen[name];
      var days=last?Math.round((mondayDate-new Date(last+"T12:00:00"))/86400000):null;
      if(days!==null&&days<60)return null;
      if(touchedThisWeek[name])return null;
      return{name:name,lastDate:last,days:days};
    }).filter(Boolean).sort(function(a,b){return(b.days||999)-(a.days||999);});

    if(!uncovered.length){
      listEl.innerHTML='<div style="padding:16px;text-align:center;font-size:12px;color:#276749;font-weight:600">✓ All quiet agents covered this week!</div>';
      return;
    }
    var h="";
    uncovered.forEach(function(a){
      var since=a.lastDate?new Date(a.lastDate+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"2-digit"}):"Never visited";
      var daysStr=a.days!==null?a.days+"d since last visit":"No visits on record";
      h+='<div style="display:flex;align-items:center;gap:10px;padding:9px 16px;border-bottom:1px solid #FAF7F2">';
      h+='<div style="flex:1"><div style="font-size:12px;font-weight:600;color:#0f172a">'+escHtml(displayName(a.name))+'</div>';
      h+='<div style="font-size:11px;color:#5C4A35">'+daysStr+'</div></div>';
      h+='<div style="font-size:11px;color:#94a3b8;text-align:right">Last: '+since+'</div>';
      h+='</div>';
    });
    listEl.innerHTML=h;
  }).catch(function(){
    listEl.innerHTML='<div style="padding:16px;font-size:12px;color:#94a3b8">Could not load — check connection</div>';
  });
}

function toggleRmFlaggedPanel(){
  var panel=document.getElementById("rm-flagged-panel");
  if(!panel)return;
  var isOpen=panel.style.display!=="none";
  if(isOpen){panel.style.display="none";return;}
  panel.style.display="block";
  // Load full flagged list
  fetch(SB_URL+"/rest/v1/call_logs?flag_rm=eq.true&select=id,agent_name,lp,call_date,note,outcome&order=call_date.desc",
    {headers:{apikey:SB_KEY,Authorization:"Bearer "+SB_KEY}})
  .then(function(r){return r.json();})
  .then(function(rows){
    var listEl=document.getElementById("rm-flagged-list");
    if(!listEl)return;
    if(!rows||!rows.length){listEl.innerHTML='<div style="padding:16px;font-size:12px;color:#94a3b8;text-align:center">No flagged agents this week</div>';return;}
    var h="";
    rows.forEach(function(r){
      var lpColor=LP_COLORS[r.lp]||"#64748b";
      h+='<div style="padding:10px 16px;border-bottom:1px solid #f1f5f9;display:flex;align-items:flex-start;gap:10px">';
      h+='<span style="font-size:16px;flex-shrink:0">🚩</span>';
      h+='<div style="flex:1;min-width:0">';
      h+='<div style="font-size:13px;font-weight:700;color:#0f172a">'+escHtml(displayName(r.agent_name))+'</div>';
      h+='<div style="font-size:11px;color:#64748b;margin-top:2px">';
      h+='<span style="font-weight:600;color:'+lpColor+'">'+escHtml(r.lp)+'</span>';
      h+=' · '+(r.call_date?new Date(r.call_date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}):"—");
      h+=(r.outcome?' · '+escHtml(r.outcome):"");
      h+='</div>';
      if(r.note)h+='<div style="font-size:11px;color:#475569;font-style:italic;margin-top:3px">"'+escHtml(r.note.substring(0,100))+'"</div>';
      h+='</div>';
      h+='<div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">';
      h+='<button data-agent="'+escHtml(r.agent_name)+'" data-lp="'+escHtml(r.lp||"")+'" data-rid="'+r.id+'" onclick="openRmFollowupForm(this)" style="font-size:10px;background:#1F4E79;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;color:#fff;font-family:inherit">Log follow-up</button>';
      h+='<button data-rid="'+r.id+'" onclick="rmClearFlag(this.getAttribute(&quot;data-rid&quot;))" style="font-size:10px;background:none;border:1px solid #e2e8f0;border-radius:6px;padding:3px 8px;cursor:pointer;color:#64748b;font-family:inherit">Clear flag</button>';
      h+='</div>';
      h+='</div>';
    });
    listEl.innerHTML=h;
  }).catch(function(){
    var listEl=document.getElementById("rm-flagged-list");
    if(listEl)listEl.innerHTML='<div style="padding:16px;font-size:12px;color:#94a3b8">Could not load — check connection</div>';
  });
}

async function rmLoadFlagged(){
  try{
    var res=await fetch(SB_URL+"/rest/v1/call_logs?flag_rm=eq.true&select=id,agent_name,lp,call_date",
      {headers:{apikey:SB_KEY,Authorization:"Bearer "+SB_KEY}});
    var rows=await res.json();
    var countEl=document.getElementById("rm-flagged-count");
    if(countEl)countEl.textContent=rows.length;
    // If panel is already open, refresh it — but NOT if user is mid-note
    var panel=document.getElementById("rm-flagged-panel");
    if(panel&&panel.style.display!=="none"){
      var activeNote=document.querySelector("[id^='fu-note-']");
      if(!activeNote||!activeNote.value.trim()){
        toggleRmFlaggedPanel();
      }
    }
  }catch(e){console.warn(e);var el=document.getElementById("rm-flagged-count");if(el)el.textContent="—";}
}

async function rmLoadCoverage(){
  try{
    var week=rmWeekRange();
    var[allAgents,priorActs,weekActs]=await Promise.all([
      // HOTFIX: was select=agent_name with no filter, so a removed/DNC'd agent (soft-deleted —
      // do_not_contact:true, retained:false, row still exists — never a real DELETE, so history
      // is preserved) still counted toward this stat and the list below it. Excludes those now.
      fetch(SB_URL+"/rest/v1/agent_profiles?select=agent_name,relationship_status&do_not_contact=neq.true&relationship_status=neq.inactive&order=agent_name.asc&limit=500",{headers:{apikey:SB_KEY,Authorization:"Bearer "+SB_KEY}}).then(function(r){return r.json();}),
      fetch(SB_URL+"/rest/v1/amanda_activities?select=agent_name,act_date&act_date=lt."+week.start+"&order=act_date.desc&limit=3000",{headers:{apikey:SB_KEY,Authorization:"Bearer "+SB_KEY}}).then(function(r){return r.json();}),
      fetch(SB_URL+"/rest/v1/amanda_activities?select=agent_name&act_date=gte."+week.start+"&act_date=lte."+week.end,{headers:{apikey:SB_KEY,Authorization:"Bearer "+SB_KEY}}).then(function(r){return r.json();})
    ]);
    var lastSeenBefore={};
    priorActs.forEach(function(a){
      var n=(a.agent_name||"").trim();
      if(n && !lastSeenBefore[n])lastSeenBefore[n]=a.act_date;
    });
    var touchedThisWeek={};
    weekActs.forEach(function(a){var n=(a.agent_name||"").trim();if(n)touchedThisWeek[n]=true;});

    var mondayDate=new Date(week.start+"T12:00:00");
    var quietAsOfMonday=allAgents.map(function(a){
      var name=(a.agent_name||"").trim();
      if(!name)return null;
      var last=lastSeenBefore[name];
      var days=last?Math.round((mondayDate-new Date(last+"T12:00:00"))/86400000):null;
      return(days===null||days>=60)?name:null;
    }).filter(Boolean);

    var covered=quietAsOfMonday.filter(function(n){return touchedThisWeek[n];}).length;
    var pct=quietAsOfMonday.length?Math.round(covered/quietAsOfMonday.length*100):100;
    document.getElementById("rm-coverage-pct").textContent=pct+"%";
  }catch(e){console.warn(e);document.getElementById("rm-coverage-pct").textContent="—";}
}




function lpscGetTotal(key,data){
  var s=0;
  LPSC_DAYS.forEach(function(d){s+=parseInt((data||{})[key+"_"+d]||0)||0;});
  return s;
}

function lpscPctBadge(t,g){
  var p=t/g,c=p>=1?"lpsc-pct-green":p>=0.6?"lpsc-pct-amber":"lpsc-pct-gray";
  return '<span class="lpsc-pct-badge '+c+'">'+Math.round(p*100)+'%</span>';
}

function lpscFmtRange(wk){
  var mon=new Date(wk+"T12:00:00"),sun=new Date(mon);
  sun.setDate(sun.getDate()+6);
  var o={month:"short",day:"numeric"};
  return mon.toLocaleDateString("en-US",o)+" – "+sun.toLocaleDateString("en-US",o);
}

function lpscAmWeekKeyOf(dateStr){
  var d=new Date(dateStr+"T12:00:00");
  var day=d.getDay();
  var diff=day===0?-6:1-day;
  d.setDate(d.getDate()+diff);
  d.setHours(0,0,0,0);
  var y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),dd=String(d.getDate()).padStart(2,"0");
  return y+"-"+m+"-"+dd;
}

async function lpscLoad(){
  var fromEl=document.getElementById("lpsc-from"),toEl=document.getElementById("lpsc-to");
  if(!fromEl.value){var d=new Date();d.setDate(d.getDate()-56);fromEl.value=localDateStr(d);}
  if(!toEl.value)toEl.value=localDateStr(new Date());

  var wrap=document.getElementById("lpsc-table-wrap");
  var chartsEl=document.getElementById("lpsc-charts");
  var summaryEl=document.getElementById("lpsc-summary");
  wrap.innerHTML='<div style="text-align:center;padding:30px;color:#888">Loading...</div>';
  chartsEl.innerHTML="";summaryEl.innerHTML="";
  lpscCharts.forEach(function(c){c.destroy();});lpscCharts=[];

  var metrics=LPSC_METRICS_MAP[lpscCurrentLP];

  try{
    var res=await fetch(
      SB_URL+"/rest/v1/lp_scorecards?person=eq."+encodeURIComponent(lpscCurrentLP)+"&week_key=gte."+fromEl.value+"&week_key=lte."+toEl.value+"&order=week_key.desc&select=week_key,data",
      {headers:{apikey:SB_KEY,Authorization:"Bearer "+SB_KEY}}
    );
    var rows=await res.json();

    if(!rows||!rows.length){
      wrap.innerHTML='<div style="text-align:center;padding:40px;color:#888">No data found for this date range.</div>';
      return;
    }

    summaryEl.innerHTML="";
    metrics.forEach(function(m){
      var grandTotal=rows.reduce(function(s,r){return s+lpscGetTotal(m.key,r.data);},0);
      var avgPerWeek=Math.round(grandTotal/rows.length);
      var pct=Math.min(avgPerWeek/m.goal,1);
      var color=pct>=1?"#2a7a3b":pct>=0.6?"#b8922a":"#9ca3af";
      var card=document.createElement("div");
      card.style="background:#fff;border-radius:10px;border:1px solid var(--border);padding:14px;text-align:center";
      card.innerHTML='<div style="font-size:20px;font-weight:700;color:'+color+'">'+avgPerWeek+'</div>'
        +'<div style="font-size:10px;color:#888;margin-top:2px;text-transform:uppercase;letter-spacing:.04em">'+m.label+'</div>'
        +'<div style="font-size:10px;color:#aaa;margin-top:1px">avg/wk &bull; goal '+m.goal+'</div>'
        +'<div style="height:3px;background:#eee;border-radius:2px;margin-top:6px;overflow:hidden">'
        +'<div style="height:100%;width:'+Math.round(pct*100)+'%;background:'+color+';border-radius:2px"></div></div>';
      summaryEl.appendChild(card);
    });

    var thead='<thead><tr><th style="background:#1F4E79;color:#fff;padding:9px 12px;text-align:left;font-size:11px;font-weight:600">Week</th>';
    metrics.forEach(function(m){thead+='<th style="background:#1F4E79;color:#fff;padding:9px 8px;text-align:center;font-size:11px;font-weight:600">'+m.label+'</th>';});
    var lpscGoalSum=metrics.reduce(function(s,m){return s+m.goal;},0);
    thead+='<th style="background:#16385c;color:var(--accent);padding:9px 10px;text-align:center;font-size:11px;font-weight:700">TOTAL<br><span style="font-size:9px;color:#cbd5e1;font-weight:400">/ '+lpscGoalSum+'</span></th>';
    thead+="</tr></thead>";

    var tbody="<tbody>";
    rows.forEach(function(row){
      var label=lpscFmtRange(row.week_key);
      tbody+='<tr style="cursor:pointer" onclick=\'lpscShowDaily("'+row.week_key+'",'+JSON.stringify(row.data)+')\'>'
        +'<td style="padding:9px 12px;font-size:12px;font-weight:500;border-bottom:1px solid #f0f2f8;white-space:nowrap">'+label+'</td>';
      var lpscRowTotal=0;
      metrics.forEach(function(m){
        var t=lpscGetTotal(m.key,row.data);
        lpscRowTotal+=t;
        tbody+='<td style="padding:9px 8px;text-align:center;font-size:12px;border-bottom:1px solid #f0f2f8">'+t+" "+lpscPctBadge(t,m.goal)+'</td>';
      });
      var lpscTotPct=lpscGoalSum?lpscRowTotal/lpscGoalSum:0;
      var lpscTotColor=lpscTotPct>=1?"#1a5c2a":lpscTotPct>=0.6?"#7a4f0a":"#555";
      var lpscTotBg=lpscTotPct>=1?"#dcf5e3":lpscTotPct>=0.6?"#fef3dc":"#f0f0f0";
      tbody+='<td style="padding:9px 10px;text-align:center;font-size:13px;font-weight:700;border-bottom:1px solid #f0f2f8;border-left:2px solid #e2e8f0;background:'+lpscTotBg+';color:'+lpscTotColor+'">'+lpscRowTotal+' / '+lpscGoalSum+'<br><span style="font-size:10px;font-weight:600">'+Math.round(lpscTotPct*100)+'%</span></td>';
      tbody+="</tr>";
    });
    tbody+="</tbody>";
    wrap.innerHTML='<table style="width:100%;border-collapse:collapse">'+thead+tbody+"</table>";

    var weeks=rows.map(function(r){return lpscFmtRange(r.week_key);}).reverse();
    metrics.forEach(function(m,i){
      var vals=rows.map(function(r){return lpscGetTotal(m.key,r.data);}).reverse();
      var div=document.createElement("div");
      div.style="background:#fff;border-radius:10px;border:1px solid var(--border);padding:16px;margin-bottom:12px";
      div.innerHTML='<div style="font-size:13px;font-weight:600;color:#1a1f2e;margin-bottom:12px">'+m.label+' — weekly trend</div>'
        +'<div style="position:relative;height:180px"><canvas id="lpsc-chart-'+i+'"></canvas></div>';
      chartsEl.appendChild(div);
      ensureChartJs().then(function(){
        var ch=new Chart(document.getElementById("lpsc-chart-"+i).getContext("2d"),{
          type:"line",
          data:{labels:weeks,datasets:[
            {label:m.label,data:vals,borderColor:LPSC_CHART_COLORS[i%5],backgroundColor:LPSC_CHART_COLORS[i%5]+"22",borderWidth:2,pointRadius:4,fill:true,tension:0.3},
            {label:"Goal",data:weeks.map(function(){return m.goal;}),borderColor:"#ccc",borderWidth:1.5,borderDash:[4,4],pointRadius:0,fill:false}
          ]},
          options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{font:{size:11}}},x:{ticks:{font:{size:10}}}}}
        });
        lpscCharts.push(ch);
      }).catch(function(){});
    });

  }catch(e){
    wrap.innerHTML='<div style="text-align:center;padding:40px;color:#888">Could not load scorecard data.</div>';
    console.warn(e);
  }
}

async function lpscLoadAmanda(){
  var fromEl=document.getElementById("lpsc-from"),toEl=document.getElementById("lpsc-to");
  if(!fromEl.value){var d=new Date();d.setDate(d.getDate()-56);fromEl.value=localDateStr(d);}
  if(!toEl.value)toEl.value=localDateStr(new Date());

  var wrap=document.getElementById("lpsc-table-wrap");
  var chartsEl=document.getElementById("lpsc-charts");
  var summaryEl=document.getElementById("lpsc-summary");
  wrap.innerHTML='<div style="text-align:center;padding:30px;color:#888">Loading...</div>';
  chartsEl.innerHTML="";summaryEl.innerHTML="";
  lpscCharts.forEach(function(c){c.destroy();});lpscCharts=[];

  try{
    var res=await fetch(
      SB_URL+"/rest/v1/amanda_activities?act_date=gte."+fromEl.value+"&act_date=lte."+toEl.value+"&select=act_type,act_date,notes",
      {headers:{apikey:SB_KEY,Authorization:"Bearer "+SB_KEY}}
    );
    var acts=await res.json();
    if(Array.isArray(acts))acts=acts.filter(function(a){return ctRmOwnerFromNotes(a.notes)==="Amanda";});

    if(!res.ok || !Array.isArray(acts)){
      wrap.innerHTML='<div style="text-align:center;padding:40px;color:#888">Could not load Amanda\'s data (request error).</div>';
      console.warn("lpscLoadAmanda bad response",res.status,acts);
      return;
    }

    if(!acts.length){
      wrap.innerHTML='<div style="text-align:center;padding:40px;color:#888">No data found for this date range.</div>';
      return;
    }

    var byWeek={};
    var actsByWeek={};
    acts.forEach(function(a){
      var wk=lpscAmWeekKeyOf(a.act_date);
      if(!byWeek[wk])byWeek[wk]={};
      byWeek[wk][a.act_type]=(byWeek[wk][a.act_type]||0)+1;
      if(!actsByWeek[wk])actsByWeek[wk]=[];
      actsByWeek[wk].push(a);
    });
    var weekKeys=Object.keys(byWeek).sort().reverse();
    // Helper: for the Talk-to's goal, count via the same aggregation used everywhere
    // else (amCntTalkTo bundles Active Agent Talk-to, CTC Call, Birthday Outreach, etc).
    // Every other goal is a literal, single act_type and reads straight from byWeek.
    function amGoalCount(g,weekActsArr,weekCounts){
      if(g.key==="Talk-to's")return amCntTalkTo(weekActsArr||[]);
      if(g.key==="__existingmeeting__")return (weekActsArr||[]).filter(function(a){return ctIsExistingRmMeeting(a.act_type);}).length;
      return(weekCounts&&weekCounts[g.key])||0;
    }

    summaryEl.innerHTML="";
    LPSC_AMANDA_GOALS.forEach(function(g){
      var grandTotal=g.key==="Talk-to's"?amCntTalkTo(acts)
        :g.key==="__existingmeeting__"?acts.filter(function(a){return ctIsExistingRmMeeting(a.act_type);}).length
        :acts.filter(function(a){return a.act_type===g.key;}).length;
      var avgPerWeek=Math.round(grandTotal/Math.max(1,weekKeys.length));
      var pct=Math.min(avgPerWeek/g.goal,1);
      var color=pct>=1?"#2a7a3b":pct>=0.6?"#b8922a":"#9ca3af";
      var card=document.createElement("div");
      card.style="background:#fff;border-radius:10px;border:1px solid var(--border);padding:14px;text-align:center";
      card.innerHTML='<div style="font-size:20px;font-weight:700;color:'+color+'">'+avgPerWeek+'</div>'
        +'<div style="font-size:10px;color:#888;margin-top:2px;text-transform:uppercase;letter-spacing:.04em">'+g.label+'</div>'
        +'<div style="font-size:10px;color:#aaa;margin-top:1px">avg/wk &bull; goal '+g.goal+'</div>'
        +'<div style="height:3px;background:#eee;border-radius:2px;margin-top:6px;overflow:hidden">'
        +'<div style="height:100%;width:'+Math.round(pct*100)+'%;background:'+color+';border-radius:2px"></div></div>';
      summaryEl.appendChild(card);
    });

    var thead='<thead><tr><th style="background:#1F4E79;color:#fff;padding:9px 12px;text-align:left;font-size:11px;font-weight:600">Week</th>';
    LPSC_AMANDA_GOALS.forEach(function(g){thead+='<th style="background:#1F4E79;color:#fff;padding:9px 8px;text-align:center;font-size:11px;font-weight:600">'+g.label+'</th>';});
    thead+="</tr></thead>";

    var tbody="<tbody>";
    weekKeys.forEach(function(wk){
      var label=lpscFmtRange(wk);
      tbody+='<tr style="cursor:pointer" onclick=\'lpscShowAmandaDaily("'+wk+'")\'>'
        +'<td style="padding:9px 12px;font-size:12px;font-weight:500;border-bottom:1px solid #f0f2f8;white-space:nowrap">'+label+'</td>';
      LPSC_AMANDA_GOALS.forEach(function(g){
        var t=amGoalCount(g,actsByWeek[wk],byWeek[wk]);
        tbody+='<td style="padding:9px 8px;text-align:center;font-size:12px;border-bottom:1px solid #f0f2f8">'+t+" "+lpscPctBadge(t,g.goal)+'</td>';
      });
      tbody+="</tr>";
    });
    tbody+="</tbody>";
    wrap.innerHTML='<table style="width:100%;border-collapse:collapse">'+thead+tbody+"</table>";
    lpscAmandaActsByWeek=actsByWeek;

    var weekLabels=weekKeys.map(function(wk){return lpscFmtRange(wk);}).reverse();
    LPSC_AMANDA_GOALS.forEach(function(g,i){
      var vals=weekKeys.map(function(wk){return amGoalCount(g,actsByWeek[wk],byWeek[wk]);}).reverse();
      var div=document.createElement("div");
      div.style="background:#fff;border-radius:10px;border:1px solid var(--border);padding:16px;margin-bottom:12px";
      div.innerHTML='<div style="font-size:13px;font-weight:600;color:#1a1f2e;margin-bottom:12px">'+g.label+' — weekly trend</div>'
        +'<div style="position:relative;height:180px"><canvas id="lpsc-chart-am-'+i+'"></canvas></div>';
      chartsEl.appendChild(div);
      ensureChartJs().then(function(){
        var ch=new Chart(document.getElementById("lpsc-chart-am-"+i).getContext("2d"),{
          type:"line",
          data:{labels:weekLabels,datasets:[
            {label:g.label,data:vals,borderColor:LPSC_CHART_COLORS[i%5],backgroundColor:LPSC_CHART_COLORS[i%5]+"22",borderWidth:2,pointRadius:4,fill:true,tension:0.3},
            {label:"Goal",data:weekLabels.map(function(){return g.goal;}),borderColor:"#ccc",borderWidth:1.5,borderDash:[4,4],pointRadius:0,fill:false}
          ]},
          options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{font:{size:11}}},x:{ticks:{font:{size:10}}}}}
        });
        lpscCharts.push(ch);
      }).catch(function(){});
    });

  }catch(e){
    wrap.innerHTML='<div style="text-align:center;padding:40px;color:#888">Could not load Amanda\'s data.</div>';
    console.warn(e);
  }
}

function lpscShowDaily(wk,data){
  var metrics=lpscCurrentLP==="Amanda"?null:LPSC_METRICS_MAP[lpscCurrentLP];
  if(!metrics)return;
  var wrap=document.getElementById("lpsc-daily-wrap");
  var label=document.getElementById("lpsc-daily-label");
  var content=document.getElementById("lpsc-daily-content");
  label.textContent=lpscCurrentLP+" — "+lpscFmtRange(wk)+" (Daily Breakdown)";

  var thead='<thead><tr><th style="background:#243d7a;color:#fff;padding:8px 12px;text-align:left;font-size:11px;font-weight:600">Metric</th>';
  LPSC_DAYS.forEach(function(d){thead+='<th style="background:#243d7a;color:#fff;padding:8px 10px;text-align:center;font-size:11px;font-weight:600">'+d+'</th>';});
  thead+='<th style="background:#243d7a;color:var(--accent);padding:8px 10px;text-align:center;font-size:11px;font-weight:600">Total</th></tr></thead>';

  var tbody="<tbody>";
  metrics.forEach(function(m){
    var total=lpscGetTotal(m.key,data);
    var pct=Math.min(total/m.goal,1);
    var color=pct>=1?"#2a7a3b":pct>=0.6?"#b8922a":"#9ca3af";
    tbody+='<tr><td style="padding:9px 12px;font-size:12px;font-weight:500;border-bottom:1px solid #f0f2f8">'+m.label+'</td>';
    LPSC_DAYS.forEach(function(day){
      var v=parseInt((data||{})[m.key+"_"+day]||0)||0;
      tbody+='<td style="padding:9px 10px;text-align:center;font-size:13px;font-weight:500;border-bottom:1px solid #f0f2f8">'+v+'</td>';
    });
    tbody+='<td style="padding:9px 10px;text-align:center;font-size:13px;font-weight:700;color:'+color+';border-bottom:1px solid #f0f2f8">'+total+' <span style="font-size:10px;color:#aaa">/'+m.goal+'</span></td></tr>';
  });
  tbody+="</tbody>";

  content.innerHTML='<table style="width:100%;border-collapse:collapse">'+thead+tbody+"</table>";
  wrap.style.display="block";
  wrap.scrollIntoView({behavior:"smooth",block:"nearest"});
}

// Amanda's data comes in as individual activity records (agent_name, act_type, act_date),
// not the pre-aggregated day-of-week columns the LP scorecards store — so her drilldown
// groups the raw records by day of week and activity type instead of reading a data blob.
function lpscShowAmandaDaily(wk){
  var weekActs=lpscAmandaActsByWeek[wk]||[];
  var wrap=document.getElementById("lpsc-daily-wrap");
  var label=document.getElementById("lpsc-daily-label");
  var content=document.getElementById("lpsc-daily-content");
  label.textContent="Amanda — "+lpscFmtRange(wk)+" (Daily Breakdown)";

  var byDay={};
  LPSC_DAYS.forEach(function(d){byDay[d]=[];});
  var dayAbbr=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  weekActs.forEach(function(a){
    var d=new Date(a.act_date+"T12:00:00");
    var abbr=dayAbbr[d.getDay()];
    if(byDay[abbr])byDay[abbr].push(a);
  });

  var thead='<thead><tr><th style="background:#243d7a;color:#fff;padding:8px 12px;text-align:left;font-size:11px;font-weight:600">Metric</th>';
  LPSC_DAYS.forEach(function(d){thead+='<th style="background:#243d7a;color:#fff;padding:8px 10px;text-align:center;font-size:11px;font-weight:600">'+d+'</th>';});
  thead+='<th style="background:#243d7a;color:var(--accent);padding:8px 10px;text-align:center;font-size:11px;font-weight:600">Total</th></tr></thead>';

  var tbody="<tbody>";
  LPSC_AMANDA_GOALS.forEach(function(g){
    var total=g.key==="Talk-to's"?amCntTalkTo(weekActs)
      :g.key==="__existingmeeting__"?weekActs.filter(function(a){return ctIsExistingRmMeeting(a.act_type);}).length
      :weekActs.filter(function(a){return a.act_type===g.key;}).length;
    var pct=Math.min(total/g.goal,1);
    var color=pct>=1?"#2a7a3b":pct>=0.6?"#b8922a":"#9ca3af";
    tbody+='<tr><td style="padding:9px 12px;font-size:12px;font-weight:500;border-bottom:1px solid #f0f2f8">'+g.label+'</td>';
    LPSC_DAYS.forEach(function(day){
      var dayActs=byDay[day]||[];
      var v=g.key==="Talk-to's"?amCntTalkTo(dayActs)
        :g.key==="__existingmeeting__"?dayActs.filter(function(a){return ctIsExistingRmMeeting(a.act_type);}).length
        :dayActs.filter(function(a){return a.act_type===g.key;}).length;
      tbody+='<td style="padding:9px 10px;text-align:center;font-size:13px;font-weight:500;border-bottom:1px solid #f0f2f8">'+(v||"")+'</td>';
    });
    tbody+='<td style="padding:9px 10px;text-align:center;font-size:13px;font-weight:700;color:'+color+';border-bottom:1px solid #f0f2f8">'+total+' <span style="font-size:10px;color:#aaa">/'+g.goal+'</span></td></tr>';
  });
  tbody+="</tbody>";

  content.innerHTML='<table style="width:100%;border-collapse:collapse">'+thead+tbody+"</table>";
  wrap.style.display="block";
  wrap.scrollIntoView({behavior:"smooth",block:"nearest"});
}


// ── LP ASSIGNMENT ────────────────────────────────────────────────────────
// Lightweight, on-demand data-quality check — no new tables required for this section itself
// (powerbi_import_log is used opportunistically if it exists; everything else reads tables both
// apps already depend on). Never blocks or breaks the admin view if a query fails.
async function loadSystemHealth(){
  var el=document.getElementById("system-health-list");
  if(!el)return;
  el.innerHTML='<div style="padding:8px 0;color:#aaa">Checking...</div>';
  try{
    var results=await Promise.all([
      sbFetch("GET","agent_profiles?select=agent_name,relationship_status,do_not_contact&limit=5000")
        .catch(function(){return sbFetch("GET","agent_profiles?select=agent_name,do_not_contact&limit=5000").catch(function(){return[];});}),
      sbFetch("GET","agent_assignments?select=agent_name,lp&limit=5000").catch(function(){return[];}),
      sbFetch("GET","powerbi_import_log?select=imported_at,source_app,errors&order=imported_at.desc&limit=1").catch(function(){return null;})
    ]);
    var profiles=results[0]||[],assignments=results[1]||[],lastImportRows=results[2];

    var lpByName={};
    assignments.forEach(function(a){var n=(a.agent_name||"").trim().toLowerCase();if(n)lpByName[n]=a.lp;});

    var issues=[];

    // Inactive agent still showing a real (non-Unassigned/__REMOVED__) LP assignment
    var inactiveWithLp=0;
    profiles.forEach(function(p){
      var status=p.relationship_status||"active";
      var lp=lpByName[(p.agent_name||"").trim().toLowerCase()];
      if(status==="inactive"&&lp&&lp!=="Unassigned"&&lp!=="__REMOVED__")inactiveWithLp++;
    });
    if(inactiveWithLp>0)issues.push(inactiveWithLp+" inactive agent"+(inactiveWithLp!==1?"s":"")+" still show an active LP assignment");

    // Active roster agent with no LP
    var activeNoLp=0;
    profiles.forEach(function(p){
      var status=p.relationship_status||"active";
      var lp=lpByName[(p.agent_name||"").trim().toLowerCase()];
      if(status!=="inactive"&&(!lp||lp==="Unassigned"))activeNoLp++;
    });
    if(activeNoLp>0)issues.push(activeNoLp+" active roster agent"+(activeNoLp!==1?"s":"")+" have no LP assigned");

    // Possible duplicate names — case/spacing collisions only (same detection basis as the RM
    // Tracker's existing "Clean up duplicate agents" tool; this just surfaces the count here too)
    var seen={};
    profiles.forEach(function(p){var n=(p.agent_name||"").trim().toLowerCase();if(n)seen[n]=(seen[n]||0)+1;});
    var dupeGroups=Object.keys(seen).filter(function(k){return seen[k]>1;}).length;
    if(dupeGroups>0)issues.push(dupeGroups+" possible duplicate name group"+(dupeGroups!==1?"s":"")+" (case/spacing variants) — see Contacts \u2192 Clean up duplicate agents in the RM Tracker");

    var dncCount=profiles.filter(function(p){return p.do_not_contact===true;}).length;

    var lastImportLine;
    if(lastImportRows===null){
      lastImportLine="Import history unavailable (powerbi_import_log table not created yet \u2014 see DEPLOY_NOW_SAFE_MIGRATIONS.sql; the import itself still works fine without it)";
    }else if(!lastImportRows.length){
      lastImportLine="No Power BI import recorded yet";
    }else{
      var li=lastImportRows[0];
      var when=new Date(li.imported_at);
      lastImportLine="Last Power BI import: "+when.toLocaleDateString()+" via "+li.source_app+(li.errors?" \u2014 "+li.errors+" error"+(li.errors!==1?"s":""):"");
    }

    var html='<div style="color:#888;margin-bottom:8px">'+lastImportLine+'</div>';
    html+='<div style="color:#888;margin-bottom:8px">DNC agents on file: '+dncCount+'</div>';
    if(issues.length){
      html+='<ul style="margin:0;padding-left:18px;color:var(--text-2)">'+issues.map(function(i){return'<li style="margin-bottom:4px">'+i+'</li>';}).join("")+'</ul>';
    }else{
      html+='<div style="color:var(--green)">No issues detected.</div>';
    }
    el.innerHTML=html;
  }catch(e){
    el.innerHTML='<div style="color:var(--red)">System Health check failed: '+e.message+'</div>';
  }
}
async function renderLpAssignList(){
  var el=document.getElementById("lp-assign-list");
  if(!el){console.warn("lp-assign-list not found");return;}
  var LPS=["Gavin","Jordan","Karen","Osgood","Said","Isaak","Unassigned"];
  var LP_COLORS={"Gavin":"#3D4E68","Karen":"#3D4E68","Osgood":"#3D4E68","Jordan":"#3D4E68","Said":"#3D4E68","Isaak":"#3D4E68"};
  var searchEl=document.getElementById("lp-assign-search");
  var showAllEl=document.getElementById("lp-assign-show-all");
  var q=searchEl?searchEl.value.toLowerCase():"";
  var showAll=showAllEl?showAllEl.checked:false;

  el.innerHTML='<div style="padding:20px;text-align:center;color:#aaa;font-size:13px">Loading...</div>';

  // REWIRED (was: rendered from SEED, a snapshot frozen into the page's HTML source at build
  // time — never reflected anything that happened in the live database afterward, which is very
  // likely why removed/reassigned agents kept resurfacing here no matter what was done live).
  // Now fetches the current Current Relationship Roster from agent_profiles, joined with actual
  // current LP assignment from agent_assignments. relationship_status falls back gracefully if
  // the column doesn't exist yet (DEPLOY_NOW_SAFE_MIGRATIONS.sql not yet run) — treats everyone
  // as active roster in that case, same as before this migration existed.
  var profilesPromise=sbFetch("GET","agent_profiles?select=agent_name,tier,relationship_status&limit=5000")
    .catch(function(){return sbFetch("GET","agent_profiles?select=agent_name,tier&limit=5000").catch(function(){return[];});});
  var assignPromise=sbFetch("GET","agent_assignments?select=agent_name,lp&limit=5000").catch(function(){return[];});
  var results=await Promise.all([profilesPromise,assignPromise]);
  var profiles=results[0]||[],assignments=results[1]||[];

  var lpByName={};
  assignments.forEach(function(a){
    var n=(a.agent_name||"").trim().toLowerCase();
    if(n)lpByName[n]=a.lp;
  });

  var list=[];
  for(var i=0;i<profiles.length;i++){
    var p=profiles[i];
    var name=(p.agent_name||"").trim();
    if(!name)continue;
    // Current Relationship Roster only — an agent removed from active management should not
    // show up here regardless of what Power BI or anything else says about them. Defaults to
    // active if relationship_status is missing/null (pre-migration or never explicitly set).
    if((p.relationship_status||"active")==="inactive")continue;
    var lpRaw=lpByName[name.toLowerCase()];
    // Defensive: a pre-migration "__REMOVED__" sentinel (the old removal marker, before
    // relationship_status existed) should never display as if it were a real LP name.
    if(lpRaw==="__REMOVED__")continue;
    var lp=(lpRaw&&lpRaw!=="Unassigned")?lpRaw:"";
    var tier=p.tier||"C";
    if(!showAll&&lp)continue;
    if(q&&name.toLowerCase().indexOf(q)<0)continue;
    list.push({name:name,tier:tier,lp:lp});
  }
  list.sort(function(a,b){return a.name.localeCompare(b.name);});

  if(!list.length){
    el.innerHTML='<div style="padding:20px;text-align:center;color:#aaa;font-size:13px">'+(showAll?"No agents match.":"All active agents are assigned! Check \"Show all agents\" to edit.")+'</div>';
    return;
  }

  var rows="";
  _lpAssignNames=list.map(function(x){return x.name;});
  _lpAssignTiers=list.map(function(x){return x.tier;});
  for(var j=0;j<list.length;j++){
    var ag=list[j];
    var tc=ag.tier==="A"?"#B45309":ag.tier==="B"?"#1D4ED8":"#888";
    var lc=LP_COLORS[ag.lp]||"#aaa";
    var opts="";
    // Blank LP explicitly selects "Unassigned" — see fix note in setAgentLP/original bug report:
    // a <select> with no option marked "selected" defaults to showing its first option in the
    // browser ("Gavin"), which looked like a real assignment even when nothing was ever saved.
    var effectiveLp=ag.lp||"Unassigned";
    for(var k=0;k<LPS.length;k++){
      opts+='<option value="'+LPS[k]+'"'+(effectiveLp===LPS[k]?" selected":"")+'>'+LPS[k]+'</option>';
    }
    var sid="lpsi_"+j;
    rows+='<tr style="border-bottom:1px solid var(--border)">'
      +'<td style="padding:8px 10px;font-size:13px;font-weight:500">'+displayName(ag.name)+'</td>'
      +'<td style="padding:8px 10px"><span style="font-size:11px;font-weight:700;color:'+tc+'">'+ag.tier+'</span></td>'
      +'<td style="padding:8px 10px"><span style="font-size:11px;font-weight:600;color:'+lc+'">'+(ag.lp||"—")+'</span></td>'
      +'<td style="padding:8px 10px;display:flex;align-items:center;gap:8px">'
      +'<select data-idx="'+j+'" onchange="setAgentLPByIdx(this)" style="border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:12px;font-family:inherit">'
      +opts+'</select>'
      +'<span id="'+sid+'" style="font-size:11px;color:var(--green);display:none">✓</span>'
      +'</td></tr>';
  }

  el.innerHTML='<div style="font-size:12px;color:#888;margin-bottom:8px">'+list.length+' agent'+(list.length!==1?'s':'')+(showAll?' total':' unassigned')+'</div>'
    +'<table style="width:100%;border-collapse:collapse">'
    +'<thead><tr style="border-bottom:2px solid var(--border)">'
    +'<th style="padding:7px 10px;text-align:left;font-size:11px;color:#888">Agent</th>'
    +'<th style="padding:7px 10px;text-align:left;font-size:11px;color:#888">Tier</th>'
    +'<th style="padding:7px 10px;text-align:left;font-size:11px;color:#888">Current LP</th>'
    +'<th style="padding:7px 10px;text-align:left;font-size:11px;color:#888">Assign to</th>'
    +'</tr></thead><tbody>'+rows+'</tbody></table>';
}


var _lpAssignNames=[];
var _lpAssignTiers=[];
function setAgentLPByIdx(sel){
  var idx=parseInt(sel.getAttribute("data-idx"));
  var name=_lpAssignNames[idx];
  if(!name)return;
  setAgentLP(name,sel.value,null,_lpAssignTiers[idx]);
}
function setAgentLP(name,lp,selectEl,tierHint){
  // REWIRED: this used to require a SEED entry to exist at all (SEED.find(...); if(!entry)
  // return;) — silently doing nothing for any agent not in that frozen snapshot, which after
  // switching renderLpAssignList() to live data would include most agents added since SEED was
  // last baked into the page. No longer depends on SEED for the save itself; SEED is updated
  // afterward only as a harmless, best-effort legacy bootstrap if an entry happens to exist.
  var entry=SEED.find(function(e){return e[0]===name;});
  var lpVal=lp==="Unassigned"?"Unassigned":lp||null;
  if(entry)entry[2]=lpVal;

  // Show saving indicator
  var savedId="lp-saved-"+name.replace(/[^a-zA-Z0-9]/g,"_");
  var savedEl=document.getElementById(savedId);
  if(savedEl){savedEl.textContent="Saving...";savedEl.style.color="var(--text-3)";savedEl.style.display="inline";}

  // Persist to Supabase agent_assignments
  sbFetch("POST","agent_assignments?on_conflict=agent_name",{
    agent_name:name,
    lp:lpVal||"Unassigned",
    level:(entry&&entry[1])||tierHint||"C",
    priority:(entry&&entry[7])||false,
    added:false
  }).then(function(){
    if(savedEl){savedEl.textContent="✓ Saved";savedEl.style.color="var(--green)";
      setTimeout(function(){if(savedEl)savedEl.style.display="none";},2000);}
    renderLpAssignList();
  }).catch(function(e){
    // Try PATCH if POST fails (row exists)
    sbFetch("PATCH","agent_assignments?agent_name=eq."+encodeURIComponent(name),{lp:lpVal||"Unassigned"})
      .then(function(){
        if(savedEl){savedEl.textContent="✓ Saved";savedEl.style.color="var(--green)";
          setTimeout(function(){if(savedEl)savedEl.style.display="none";},2000);}
        renderLpAssignList();
      }).catch(function(){
        if(savedEl){savedEl.textContent="✗ Error";savedEl.style.color="var(--red)";}
      });
  });
}

function loadLpOverrides(){
  // Now handled by loadAgentAssignments() which reads from Supabase
  // Called on boot already — this is a no-op kept for compatibility
}


// ── FACE TIME ─────────────────────────────────────────────────────────────
// Thresholds (days): [warn, red, critical]
var FT_THRESHOLDS={Channel:[10,14,21],A:[10,14,21],B:[21,30,45],C:[45,60,90]};
var FT_TARGETS={Channel:14,A:14,B:30,C:60};
function sharedFaceTimePriorityScore(r){
  if(r.scheduled)return -100000;
  var severity={critical:4200,red:2700,warn:1300,ok:0},tier={Channel:1100,A:1000,B:560,C:180};
  var score=(severity[r.status]||0)+(tier[r.tier]||0);
  if(r.competitor_risk_flag)score+=1500;if(r.high_potential_flag)score+=650;if(String(r.next_growth_opportunity||'').trim())score+=550;
  if(r.daysLead!==null){if(r.daysLead<=14)score+=750;else if(r.daysLead<=30)score+=520;else if(r.daysLead<=60)score+=300;}
  score+=Math.min(550,Number(r.closes_past_year||0)*100+Number(r.total_leads_past_year||0)*45);
  if(r.days===null)score+=700;else score+=Math.min(650,Math.max(0,r.days-(r.target||60))*18);
  return score;
}
function sharedFaceTimeWhy(r){
  var why=[];if(r.status==='critical')why.push(r.days===null?'no visit on file':'critically overdue');else if(r.status==='red')why.push('overdue');else if(r.status==='warn')why.push('coming due');
  if(r.tier==='Channel'||r.tier==='A')why.push(r.tier+' relationship');else if(r.tier==='B')why.push('B relationship');
  if(r.competitor_risk_flag)why.push('retention risk');if(r.high_potential_flag)why.push('high potential');if(String(r.next_growth_opportunity||'').trim())why.push('active opportunity');if(r.daysLead!==null&&r.daysLead<=60)why.push('recent business');
  return why.slice(0,3).join(' · ')||'relationship cadence';
}
// Explicit roster exclusion: Patrick Klein is no longer active. Preserve historical
// activity; do not reintroduce him via an older Power BI export or fallback queue.
function ctExcludedFromActiveAgentRoster(name){
  // User-confirmed Power BI exclusions: Tina Hoffman is retiring; standalone
  // Rockford rows are builder-name typos, not additional realtor relationships.
  // Preserve historical records and legitimate named Rockford contacts.
  var key=String(name||"").trim().replace(/\s+/g," ").replace(/[–—]/g,"-").toUpperCase();
  return key==="PATRICK KLEIN"||key==="TINA HOFFMAN"||
    key==="TINA HOFFMAN (ROCKFORD)"||key==="ROCKFORD"||
    key==="ROCKFORD HOMES"||key==="ROCKFORD HOMES - DERON";
}
var ftData={};  // normalized agent name → {lastDate, source, notes}
var ftVisitRows=[]; // all visit records used for month-to-date counts
var ftRosterRows=[]; // shared active partner population from agent_profiles + agent_assignments

async function loadFaceTime(){
  var listEl=document.getElementById("ft-list");
  if(listEl)listEl.innerHTML='<div style="text-align:center;color:var(--text-4);padding:30px;font-size:13px">Loading...</div>';
  try{
    // v63 source-of-truth for BOTH trackers: latest Power BI active partner population,
    // same assignments, same two visit sources, same cadence thresholds.
    var ftSourceErrors=[];
    var ftSafe=function(label,promise){return promise.catch(function(e){ftSourceErrors.push(label+": "+String(e&&e.message||e));return [];});};
    var r=await Promise.all([
      ftSafe("RM visit history",sbFetch("GET","amanda_activities?select=agent_name,act_date,notes&act_type=in.(Break%20Breads,Break%20Bread)&order=act_date.desc&limit=4000")),
      ftSafe("LP visit history",sbFetch("GET","break_breads?select=agent_name,date,notes,logged_by&order=date.desc&limit=4000")),
      loadCoMarketing(),
      ftSafe("Agent profiles",sbFetch("GET","agent_profiles?select=agent_name,tier,powerbi_level,powerbi_last_seen_at,retained,do_not_contact,relationship_status,relationship_type,lp_outreach_status,competitor_risk_flag,high_potential_flag,next_growth_opportunity,latest_lead_date,closes_past_year,total_leads_past_year&limit=5000").catch(function(e){ftSourceErrors.push("Full profile query unavailable: "+String(e&&e.message||e));return sbFetch("GET","agent_profiles?select=agent_name,tier,powerbi_level,powerbi_last_seen_at,do_not_contact,relationship_status&limit=5000");}).catch(function(e){ftSourceErrors.push("Profile fallback query unavailable: "+String(e&&e.message||e));return sbFetch("GET","agent_profiles?select=agent_name,tier,powerbi_level,do_not_contact,relationship_status&limit=5000");})),
      ftSafe("LP assignments",sbFetch("GET","agent_assignments?select=agent_name,lp,rm&limit=5000")),
      sbFetch("GET","face_time_events?select=*&status=eq.scheduled&event_date=gte."+today2()+"&order=event_date.asc,event_time.asc&limit=1000").catch(function(){return[];})
    ]);
    ftData={};ftVisitRows=[];window.FT_SCHEDULED_EVENTS=Array.isArray(r[5])?r[5]:[];
    var sh=document.getElementById("ft-scheduled-shared");if(sh){var upcoming=window.FT_SCHEDULED_EVENTS.slice().sort(function(a,b){return String(a.event_date||"").localeCompare(String(b.event_date||""))||String(a.event_time||"").localeCompare(String(b.event_time||""));}).slice(0,10);sh.innerHTML=upcoming.length?'<div style="background:#F2F6F2;border:1px solid #D0DED3;border-radius:10px;padding:10px 12px"><div style="font-size:11px;font-weight:800;color:#3E5C49;text-transform:uppercase;letter-spacing:.35px;margin-bottom:5px">Upcoming shared Face Time</div>'+upcoming.map(function(ev){return '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;padding:5px 0;border-top:1px solid #E1EAE3"><div><strong style="font-size:12px;color:var(--text-1)">'+escHtml(displayName(ev.agent_name||""))+'</strong><div style="font-size:10.5px;color:var(--text-3)">'+escHtml(ev.event_date||"")+(ev.event_time?' · '+escHtml(String(ev.event_time).slice(0,5)):'')+' · LP: '+escHtml(ev.lp||"TBD")+' · RM: '+escHtml(ev.rm||"Amanda")+'</div></div><button class="ft-shared-open" data-id="'+escHtml(String(ev.id||""))+'" data-agent="'+escHtml(ev.agent_name||"")+'" data-lp="'+escHtml(ev.lp||"")+'" style="border:1px solid #BCD0C0;background:#fff;color:#365342;border-radius:6px;padding:5px 8px;font-size:10px;font-weight:700;cursor:pointer">Open</button></div>';}).join('')+'</div>':'';setTimeout(function(){sh.querySelectorAll(".ft-shared-open").forEach(function(b){b.addEventListener("click",function(){v33OpenSharedFaceTime(this.dataset.agent,this.dataset.lp,this.dataset.id);});});},0);}

    (r[0]||[]).forEach(function(a){
      var n=(a.agent_name||"").trim().toUpperCase();if(!n)return;
      var owner=(typeof ctRmOwnerFromNotes==="function"?ctRmOwnerFromNotes(a.notes):"Amanda")||"Amanda";
      ftVisitRows.push({agent_name:a.agent_name,date:a.act_date,source:owner,notes:a.notes||""});
      if(!ftData[n]||a.act_date>ftData[n].lastDate)ftData[n]={lastDate:a.act_date,source:owner,notes:a.notes||""};
    });
    (r[1]||[]).forEach(function(b){
      var n=(b.agent_name||"").trim().toUpperCase();if(!n)return;
      ftVisitRows.push({agent_name:b.agent_name,date:b.date,source:b.logged_by||"LP",notes:b.notes||""});
      if(!ftData[n]||b.date>ftData[n].lastDate)ftData[n]={lastDate:b.date,source:b.logged_by||"LP",notes:b.notes||""};
    });
    var ownerMap={};
    (r[4]||[]).forEach(function(a){var k=(a.agent_name||"").trim().toUpperCase();if(k)ownerMap[k]={lp:(a.lp&&a.lp!=="__REMOVED__")?a.lp:"Unassigned",rm:a.rm||"Unassigned",removed:a.lp==="__REMOVED__"};});
    // FIX (2026-08-19): agent_assignments can have more than one row for the same agent (a stale
    // duplicate legacy row, or genuine Amanda+Nyny dual credit), and this query has no explicit
    // ORDER BY — so "whichever row Supabase happens to return last" was deciding rm above, which is
    // non-deterministic and can silently disagree with RM Tracker reading the exact same table.
    // Resolve rm conflicts the same deterministic way RM Tracker now does, so both tools always
    // agree on the owner for a given relationship. Only rm changes here — lp/removed keep the
    // existing behavior above.
    var ctOwnerRecords={};
    (r[4]||[]).forEach(function(a){var k=(a.agent_name||"").trim().toUpperCase();if(!k)return;if(!ctOwnerRecords[k])ctOwnerRecords[k]={rms:new Set()};if(a.rm==="Amanda"||a.rm==="Nyny")ctOwnerRecords[k].rms.add(a.rm);});
    function ctResolveRmOwner(agentKey,tier){
      var rec=ctOwnerRecords[agentKey];
      if(rec&&rec.rms&&rec.rms.size===1)return Array.from(rec.rms)[0];
      if(rec&&rec.rms&&rec.rms.size>1)return tier==="Channel"?"Nyny":"Amanda";
      if(tier==="Channel")return"Nyny";
      return"Unassigned";
    }
    // v63 FACE TIME SOURCE OF TRUTH: only the latest Power BI-stamped ACTIVE PARTNER population
    // can enter Face Time. A thin contact/profile row is not enough. This is the same definition
    // the RM tracker consumes, so both apps start from one population before applying ownership.
    var latestFtPbMs=0;
    (r[3]||[]).forEach(function(p){var ms=Date.parse(p&&p.powerbi_last_seen_at||"");if(Number.isFinite(ms)&&ms>latestFtPbMs)latestFtPbMs=ms;});
    function ftIsCurrentPowerBiRow(p){
      var ms=Date.parse(p&&p.powerbi_last_seen_at||"");
      return !!latestFtPbMs&&Number.isFinite(ms)&&Math.abs(ms-latestFtPbMs)<120000;
    }
    var ftProfileRows=Array.isArray(r[3])?r[3]:[];
    var ftSourceLabel="Latest Power BI profiles";
    var eligibleProfile=function(p){
      var k=String(p.agent_name||"").trim().toUpperCase(),o=ownerMap[k]||{};
      return !!k&&!ctExcludedFromActiveAgentRoster(p.agent_name)&&!p.do_not_contact&&!o.removed
        &&String(p.relationship_status||"active").toLowerCase()!=="inactive"
        &&String(p.relationship_type||"realtor").toLowerCase()!=="strategic_partner"
        &&String(p.lp_outreach_status||"active").toLowerCase()!=="nurture";
    };
    // v310: The Power BI importer can stamp individual profile rows at different times.
    // Do not silently remove valid active relationships because they missed a 2-minute window.
    // v312: Source-of-truth order is the most recent SHARED Power BI import,
    // then a genuinely newer local upload. Never blend old profile rows into a
    // healthy fresh Power BI cohort: that resurrects removed agents.
    var ftStamped=ftProfileRows.filter(function(p){
      var ms=Date.parse(p&&p.powerbi_last_seen_at||"");
      return Number.isFinite(ms)&&latestFtPbMs&&Math.abs(ms-latestFtPbMs)<=15*60000;
    });
    var ftActiveProfiles=ftStamped.filter(eligibleProfile);
    var currentCount=ftActiveProfiles.length;
    var ftSourceLabel="Latest shared Power BI profiles";
    var saved=null;try{saved=typeof ctGetCurrentPowerBiSnapshot==="function"?ctGetCurrentPowerBiSnapshot():null;}catch(e){}
    var localMs=Date.parse(saved&&saved.imported_at||"")||0;
    var localBy=saved&&saved.by_agent||{},profileByName={};
    ftProfileRows.forEach(function(p){profileByName[String(p.agent_name||"").trim().toUpperCase()]=p;});
    var rosterKeys=new Set(ftActiveProfiles.map(function(p){return String(p.agent_name||"").trim().toUpperCase();}));
    var browserAdded=0,profileAdded=0;
    var localIsNewer=localMs>0&&(!latestFtPbMs||localMs>latestFtPbMs+15*60000);
    // Only a timestamped, genuinely newer local upload can replace the server roster.
    if(localIsNewer&&Object.keys(localBy).length){
      ftActiveProfiles=[];rosterKeys.clear();
      Object.keys(localBy).forEach(function(k){
        var row=localBy[k]||{},name=String(row.name||k).trim(),key=name.toUpperCase();
        if(!key||rosterKeys.has(key))return;
        var profile=profileByName[key]||{};
        var merged=Object.assign({},profile,{agent_name:name,
          powerbi_level:row.level||profile.powerbi_level||"",
          closes_past_year:row.closed_12mo??profile.closes_past_year??0,
          total_leads_past_year:row.total_leads_12mo??profile.total_leads_past_year??0});
        if(!eligibleProfile(merged))return;
        ftActiveProfiles.push(merged);rosterKeys.add(key);browserAdded++;
      });
      ftSourceLabel="Newer Power BI upload in this browser (shared sync pending)";
    }
    // If the freshest server batch was partial/failed, show provisional profiles
    // instead of a blank list. Never label that provisional data as current Power BI.
    if(!ftActiveProfiles.length){
      ftProfileRows.forEach(function(p){
        var key=String(p.agent_name||"").trim().toUpperCase();
        var level=String(p.tier||p.powerbi_level||"").trim().toUpperCase();
        if(!key||rosterKeys.has(key)||!eligibleProfile(p)||!["CHANNEL","A","B","C"].includes(level))return;
        ftActiveProfiles.push(p);rosterKeys.add(key);profileAdded++;
      });
      if(profileAdded)ftSourceLabel="Provisional eligible profiles (Power BI sync incomplete)";
    }
    // A failed profile query must not make Face Time completely empty when LP
    // ownership data is available. Those rows are labeled provisional.
    var assignmentAdded=0;
    if(!ftActiveProfiles.length){
      (r[4]||[]).forEach(function(a){
        var name=String(a.agent_name||"").trim(),key=name.toUpperCase();
        if(!name||ctExcludedFromActiveAgentRoster(name)||rosterKeys.has(key)||a.lp==="__REMOVED__"||
          (typeof ctRosterRemoved==="function"&&ctRosterRemoved(name))||
          (typeof ctInactiveRosterNames!=="undefined"&&ctInactiveRosterNames.has(name.toLowerCase())))return;
        var p=profileByName[key];
        if(p&&!eligibleProfile(p))return;
        ftActiveProfiles.push(Object.assign({},p||{},{
          agent_name:name,tier:p&&p.tier||"C",powerbi_level:p&&p.powerbi_level||"C",
          _fallbackLp:a.lp||"Unassigned"
        }));
        rosterKeys.add(key);assignmentAdded++;
      });
      if(assignmentAdded)ftSourceLabel="Provisional LP assignments (Power BI not verified)";
    }
    if(!ftActiveProfiles.length){
      var legacy=Array.isArray(agents)?agents:[],seenLegacy=new Set();
      ftActiveProfiles=legacy.filter(function(a){
        var name=String(a&&a[0]||"").trim(),key=name.toUpperCase(),owner=ownerMap[key]||{};
        if(!name||ctExcludedFromActiveAgentRoster(name)||seenLegacy.has(key)||owner.removed||
          (typeof ctRosterRemoved==="function"&&ctRosterRemoved(name))||
          (typeof ctInactiveRosterNames!=="undefined"&&ctInactiveRosterNames.has(name.toLowerCase())))return false;
        seenLegacy.add(key);return true;
      }).map(function(a){
        var name=String(a[0]).trim(),owner=ownerMap[name.toUpperCase()]||{};
        return {agent_name:name,tier:a[1]||"C",powerbi_level:a[1]||"C",
          _fallbackLp:owner.lp||a[2]||"Unassigned",closes_past_year:a[8]||0};
      });
      if(ftActiveProfiles.length)ftSourceLabel="Provisional cached roster (Power BI not verified)";
    }
    if(!currentCount&&ftActiveProfiles.length)ftSourceErrors.push("No current-stamped Power BI profiles; showing clearly labeled fallback.");
    var uniqueFt=new Map();
    ftActiveProfiles.forEach(function(p){
      var k=String(p.agent_name||"").trim().toUpperCase(),o=ownerMap[k]||{},
        t=String(p.tier||"").trim().toUpperCase(),pb=String(p.powerbi_level||"").trim().toUpperCase(),
        tier=t==="CHANNEL"?"Channel":(["A","B","C"].includes(pb)?pb:(["A","B","C"].includes(t)?t:"C"));
      if(!k||uniqueFt.has(k))return;
      uniqueFt.set(k,{name:p.agent_name,tier:tier,lp:o.lp||"Unassigned",rm:ctResolveRmOwner(k,tier),
        competitor_risk_flag:!!p.competitor_risk_flag,high_potential_flag:!!p.high_potential_flag,
        next_growth_opportunity:p.next_growth_opportunity||"",latest_lead_date:p.latest_lead_date||null,
        closes_past_year:p.closes_past_year||0,total_leads_past_year:p.total_leads_past_year||0});
    });
    ftRosterRows=Array.from(uniqueFt.values());
    window.CT_FT_ROSTER_LOADED=!!ftRosterRows.length;
    window.CT_FT_VISITS_LOADED=!ftSourceErrors.some(function(x){return x.startsWith("RM visit history:")||x.startsWith("LP visit history:");});
    var notice=document.getElementById("ft-roster-notice");
    if(!notice){notice=document.createElement("div");notice.id="ft-roster-notice";var page=document.getElementById("view-facetime");if(page)page.insertBefore(notice,page.querySelector(".ft-summary")||page.firstChild);}
    if(notice){
      notice.style.display="block";
      notice.style.cssText="padding:10px 12px;margin-bottom:12px;font-size:12px;border-radius:8px;background:"+(ftRosterRows.length&&ftSourceLabel==="Latest shared Power BI profiles"&&!ftSourceErrors.length?"#eff8f2":"#fff6e8")+";color:#2c4861;border:1px solid #d7e4eb";
      var unassigned=ftRosterRows.filter(function(p){return !p.lp||p.lp==="Unassigned";}).length;
      notice.textContent=ftRosterRows.length?
        ftRosterRows.length+" eligible Face Time agents · "+ftSourceLabel+(ftStamped.length&&ftSourceLabel==="Latest shared Power BI profiles"?" · "+ftStamped.length+" profiles in the latest import ("+Math.max(0,ftStamped.length-ftRosterRows.length)+" excluded by saved eligibility rules)":"")+(unassigned?" · "+unassigned+" need LP assignment":"")+(ftSourceErrors.length?" · Source warning: "+ftSourceErrors.join("; "):""):
        "Agent roster unavailable. Profile rows: "+ftProfileRows.length+"; assignments: "+(r[4]||[]).length+"; Power BI stamp: "+(latestFtPbMs?"present":"missing")+(ftSourceErrors.length?"; errors: "+ftSourceErrors.join("; "):"")+". No data was deleted.";
    }
    renderFaceTime();
  }catch(e){
    var msg="Face Time could not load: "+String(e&&e.message||e);
    var banner=document.getElementById("ft-roster-notice");
    if(banner){banner.style.cssText="display:block;margin-bottom:12px;padding:12px;border:1px solid #f2c1b8;background:#fff0ed;color:#842c27;border-radius:8px";banner.textContent=msg;}
    if(listEl)listEl.innerHTML='<div style="text-align:center;color:var(--red);padding:30px;font-size:13px">'+msg+'</div>';
    console.error("Face Time load error",e);
  }
}

function ftStatus(tier,days){
  var t=FT_THRESHOLDS[tier]||FT_THRESHOLDS.C;
  if(days===null)return"critical";
  if(days>=t[2])return"critical";
  if(days>=t[1])return"red";
  if(days>=t[0])return"warn";
  return"ok";
}


function ftAgentRows(){
  var now=new Date();
  var roster=(ftRosterRows||[]).filter(function(e){return e.lp!=="Isaak";});
  return roster.map(function(e){
    var name=e.name,tier=e.tier||"C",lp=e.lp||"Unassigned";
    var ft=ftData[(name||"").trim().toUpperCase()],days=null;
    if(ft&&ft.lastDate)days=Math.max(0,Math.round((now-new Date(ft.lastDate+"T12:00:00"))/86400000));
    var target=FT_TARGETS[tier]||FT_TARGETS.C;
    var sched=(window.FT_SCHEDULED_EVENTS||[]).filter(function(x){return String(x.agent_name||"").trim().toUpperCase()===String(name||"").trim().toUpperCase()&&x.status==="scheduled"&&String(x.event_date||"")>=today2();}).sort(function(a,b){return String(a.event_date||"").localeCompare(String(b.event_date||""));})[0]||null;
    var leadDate=e.latest_lead_date?String(e.latest_lead_date).slice(0,10):null,daysLead=leadDate?Math.max(0,Math.floor((now-new Date(leadDate+"T12:00:00"))/86400000)):null;
    var row={name:name,tier:tier,lp:lp,rm:e.rm||"Unassigned",days:days,status:ftStatus(tier,days),target:target,lastDate:ft?ft.lastDate:null,source:ft?ft.source:"",notes:ft?ft.notes:"",coMkt:coMarketingIsActive(name),scheduled:sched,competitor_risk_flag:!!e.competitor_risk_flag,high_potential_flag:!!e.high_potential_flag,next_growth_opportunity:e.next_growth_opportunity||"",daysLead:daysLead,closes_past_year:e.closes_past_year||0,total_leads_past_year:e.total_leads_past_year||0};
    row.priorityScore=sharedFaceTimePriorityScore(row);row.priorityWhy=sharedFaceTimeWhy(row);return row;
  });
}

function ftPriorityForLp(lp,count){
  if(lp==="Isaak")return [];
  var rows=ftAgentRows().filter(function(a){return a.lp===lp;});
  rows.sort(function(a,b){if(!!a.scheduled!==!!b.scheduled)return a.scheduled?1:-1;return (b.priorityScore-a.priorityScore)||String(a.name).localeCompare(String(b.name));});
  return rows.slice(0,count||3);
}
function ftOpenAgentLog(name,lp){
  var d=document.getElementById("ft-full-details");if(d)d.open=true;
  var lpEl=document.getElementById("ft-lp-filter"),tierEl=document.getElementById("ft-tier-filter"),statusEl=document.getElementById("ft-status-filter");
  if(lpEl)lpEl.value=lp||"all";if(tierEl)tierEl.value="all";if(statusEl)statusEl.value="all";
  renderFaceTime();
  setTimeout(function(){
    var target=null;
    document.querySelectorAll("#ft-list .ft-save-btn").forEach(function(btn){if(btn.dataset.agent===name)target=btn;});
    if(!target)return;
    var fid=target.dataset.fid;var form=document.getElementById(fid);
    if(form&&!form.classList.contains("show"))ftToggleLog(fid);
    if(form)form.scrollIntoView({behavior:"smooth",block:"center"});
  },40);
}
function ftOpenAgentRow(name,lp){
  var details=document.getElementById("ft-full-details");if(details)details.open=true;
  var lpEl=document.getElementById("ft-lp-filter"),tierEl=document.getElementById("ft-tier-filter"),statusEl=document.getElementById("ft-status-filter"),comktEl=document.getElementById("ft-comkt-filter");
  if(lpEl)lpEl.value="all";if(tierEl)tierEl.value="all";if(statusEl)statusEl.value="all";if(comktEl)comktEl.value="all";
  renderFaceTime();
  var matching=Array.from(document.querySelectorAll("#ft-list .ft-row[data-agent]")).find(function(el){return el.dataset.agent===name;});
  if(matching){matching.scrollIntoView({behavior:"smooth",block:"center"});matching.style.outline="2px solid #78acc4";setTimeout(function(){matching.style.outline="";},2200);}
}
var ftActionShowAll=false;
function renderFtActionWorklist(){
  var host=document.getElementById("ft-action-results");if(!host)return;
  var loaded=!!window.CT_FT_ROSTER_LOADED;
  if(!loaded){host.innerHTML='<div style="color:#64748b;font-size:12px;padding:10px">Current roster unavailable. Refresh Face Time to retry.</div>';return;}
  var status=(document.getElementById("ft-action-status")||{}).value||"due14",sort=(document.getElementById("ft-action-sort")||{}).value||"due",lp=(document.getElementById("ft-action-lp")||{}).value||"all",search=String((document.getElementById("ft-action-search")||{}).value||"").trim().toLowerCase();
  var rows=ftAgentRows().filter(function(a){
    var left=a.days===null?null:a.target-a.days;
    if(lp!=="all"&&a.lp!==lp)return false;
    if(search&&!String(a.name).toLowerCase().includes(search))return false;
    if(status==="overdue")return !a.scheduled&&(left===null||left<=0);
    if(status==="due7")return !a.scheduled&&left!==null&&left>=0&&left<=7;
    if(status==="due14")return !a.scheduled&&(left===null||left<=14);
    if(status==="booked")return !!a.scheduled;
    if(status==="ontrack")return !a.scheduled&&left!==null&&left>14;
    return true;
  });
  var urgency=function(a){return a.scheduled?100000:(a.days===null?-100000:a.target-a.days);};
  rows.sort(function(a,b){
    if(sort==="name")return a.name.localeCompare(b.name);
    if(sort==="tier"){var rank={Channel:0,A:1,B:2,C:3};return (rank[a.tier]??9)-(rank[b.tier]??9)||urgency(a)-urgency(b)||a.name.localeCompare(b.name);}
    if(sort==="lp")return a.lp.localeCompare(b.lp)||urgency(a)-urgency(b)||a.name.localeCompare(b.name);
    return urgency(a)-urgency(b)||a.name.localeCompare(b.name);
  });
  var count=document.getElementById("ft-action-count");if(count)count.textContent=rows.length+" matching agents";
  var showing=ftActionShowAll?rows:rows.slice(0,30);
  var html='<div style="display:grid;gap:0">';
  showing.forEach(function(a){
    var left=a.days===null?null:a.target-a.days;
    var due=a.scheduled?"Booked "+String(a.scheduled.event_date||""):(left===null?"First visit needed":left<0?"Overdue "+Math.abs(left)+"d":left===0?"Due today":"Due in "+left+"d");
    var urgent=!a.scheduled&&(left===null||left<=0);
    var color=a.scheduled?"#286548":urgent?"#b53832":"#73521e";
    html+='<div style="display:grid;grid-template-columns:minmax(140px,1.3fr) minmax(95px,.8fr) minmax(95px,.8fr) auto;align-items:center;gap:8px;padding:9px 2px;border-top:1px solid #edf0f4;font-size:11px">'
      +'<button type="button" class="ft-action-name" data-agent="'+escHtml(a.name)+'" data-lp="'+escHtml(a.lp)+'" style="text-align:left;padding:0;border:0;background:none;color:#155d85;text-decoration:underline;text-underline-offset:3px;font-size:12px;font-weight:700;cursor:pointer">'+escHtml(displayName(a.name))+'</button>'
      +'<span style="color:#567083">'+escHtml(a.tier)+' · '+escHtml(a.lp)+'</span>'
      +'<strong style="color:'+color+'">'+escHtml(due)+'</strong>'
      +'<span style="display:flex;gap:5px;justify-content:flex-end"><button type="button" class="ft-action-book" data-agent="'+escHtml(a.name)+'" data-lp="'+escHtml(a.lp)+'" data-id="'+escHtml(String(a.scheduled&&a.scheduled.id||""))+'" style="padding:5px 7px;border:1px solid #b8d4c3;border-radius:6px;background:#f3f9f5;cursor:pointer">'+(a.scheduled?'Open':'Book')+'</button><button type="button" class="ft-action-log" data-agent="'+escHtml(a.name)+'" data-lp="'+escHtml(a.lp)+'" style="padding:5px 7px;border:1px solid #c3dbe7;border-radius:6px;background:#eff9fc;cursor:pointer">Log</button></span></div>';
  });
  html+='</div>';
  if(!rows.length)html='<div style="padding:12px;color:#64748b;font-size:12px">No agents match these filters.</div>';
  if(rows.length>30)html+='<button type="button" id="ft-action-more" style="margin-top:10px;border:1px solid #cedce6;background:#f7fafc;border-radius:7px;padding:8px 12px;cursor:pointer;font-size:12px">'+(ftActionShowAll?'Show fewer':'Show all '+rows.length+' agents')+'</button>';
  host.innerHTML=html;
  host.querySelectorAll(".ft-action-name").forEach(function(btn){btn.addEventListener("click",function(){ftOpenAgentRow(this.dataset.agent,this.dataset.lp);});});
  host.querySelectorAll(".ft-action-book").forEach(function(btn){btn.addEventListener("click",function(){v33OpenSharedFaceTime(this.dataset.agent,this.dataset.lp,this.dataset.id||"");});});
  host.querySelectorAll(".ft-action-log").forEach(function(btn){btn.addEventListener("click",function(){ftOpenAgentLog(this.dataset.agent,this.dataset.lp);});});
  var more=document.getElementById("ft-action-more");if(more)more.addEventListener("click",function(){ftActionShowAll=!ftActionShowAll;renderFtActionWorklist();});
}

function renderFtPriority(){
  var el=document.getElementById("ft-priority");if(!el)return;
  var lps=["Gavin","Karen","Osgood","Jordan","Said"],html="",focusTotal=0;
  lps.forEach(function(lp){
    var list=ftPriorityForLp(lp,3);focusTotal+=list.length;
    html+='<div style="border-top:1px solid #ECE8F5;padding:10px 0 8px">'
      +'<div style="font-size:12px;font-weight:800;color:#071B37;margin-bottom:6px">'+lp+'</div>';
    if(!list.length){html+='<div style="font-size:12px;color:var(--text-3)">No active assigned partners.</div>';}
    list.forEach(function(a){
      var last=a.lastDate?(a.days+"d since last visit"):'Book first visit';
      var due=a.scheduled?('Booked '+a.scheduled.event_date+(a.scheduled.event_time?' · '+String(a.scheduled.event_time).slice(0,5):'')):(a.days===null?'Book first visit':(a.days>a.target?'Overdue '+(a.days-a.target)+'d':a.days===a.target?'Due today':'Due in '+(a.target-a.days)+'d'));
      var dueColor=a.scheduled?'#365342':((a.days===null||a.days>=a.target)?'#A32D2D':'#5C4A35');
      html+='<div style="display:grid;grid-template-columns:minmax(180px,1fr) 62px minmax(125px,.8fr) auto;gap:8px;align-items:center;padding:6px 0;border-top:1px solid #F2F0F7">'
        +'<div><span style="font-size:12.5px;font-weight:700;color:var(--text-1)">'+displayName(a.name)+'</span> <span class="badge badge-'+String(a.tier).toLowerCase()+'" style="font-size:9px">'+a.tier+'</span></div>'
        +'<div style="font-size:11px;color:var(--text-3)">'+last+'</div>'
        +'<div style="font-size:11px;font-weight:700;color:'+dueColor+'">'+due+'</div>'
        +'<span style="display:flex;gap:5px;justify-content:flex-end"><button type="button" class="ft-priority-book" data-agent="'+escHtml(a.name)+'" data-lp="'+escHtml(lp)+'" data-id="'+escHtml(String(a.scheduled&&a.scheduled.id||""))+'" style="border:1px solid #BFD1C2;background:#F4F8F4;color:#365342;border-radius:6px;padding:5px 8px;font-size:10px;font-weight:700;cursor:pointer">'+(a.scheduled?'Open':'Book')+'</button><button type="button" class="ft-priority-log" data-agent="'+escHtml(a.name)+'" data-lp="'+escHtml(lp)+'" style="border:1px solid #CDEAF2;background:#EFF9FC;color:#071B37;border-radius:6px;padding:5px 8px;font-size:10px;font-weight:700;cursor:pointer">Log visit</button></span>'
        +'</div>';
    });
    html+='</div>';
  });
  el.innerHTML=html;
  el.querySelectorAll(".ft-priority-log").forEach(function(btn){btn.addEventListener("click",function(){ftOpenAgentLog(this.dataset.agent,this.dataset.lp);});});
  el.querySelectorAll(".ft-priority-book").forEach(function(btn){btn.addEventListener("click",function(){v33OpenSharedFaceTime(this.dataset.agent,this.dataset.lp,this.dataset.id||"");});});
  var f=document.getElementById("ft-s-focus");if(f)f.textContent=window.CT_FT_ROSTER_LOADED?focusTotal:"—";
}

/* ── Persistent LP-side RM response history ───────────────────────────────
   Direct RM replies are communications, not passive history. A reply stays
   visibly NEW until that LP opens the response panel. The read marker is kept
   per LP in this browser; a different device will still surface the reply so
   an important RM message is not silently suppressed elsewhere. */
function ctRmResponseTime(r){
  var raw=String(r&&r.rm_note_at||r&&r.handled_at||r&&r.created_at||"");
  var t=Date.parse(raw);
  if(!isNaN(t))return t;
  // Date-only fallback remains sortable and stable.
  t=Date.parse(raw.slice(0,10)+"T12:00:00");
  return isNaN(t)?0:t;
}
function ctRmResponseFingerprint(lp,r){
  // Stable across re-renders and direct/legacy normalization. Do NOT include display name or note text.
  var basis=[String(lp||"").toLowerCase(),String(r&&r.id||""),String(r&&r.rm_note_at||r&&r.created_at||"")].join("|");
  var h=0;for(var i=0;i<basis.length;i++)h=((h<<5)-h+basis.charCodeAt(i))|0;
  return "rmresponse:"+String(lp||"").toLowerCase()+":"+Math.abs(h);
}
function ctRmResponseReadMap(lp){
  try{return JSON.parse(localStorage.getItem("lp_rm_responses_cleared_v49_"+String(lp||"").toLowerCase())||"{}")}catch(e){return{}}
}
function ctRmResponseClearThrough(lp){
  try{return Number(localStorage.getItem("lp_rm_responses_clear_through_v49_"+String(lp||"").toLowerCase())||0)||0}catch(e){return 0}
}
function ctRmClearFingerprintDirect(lp,fingerprint){
  try{
    var m=ctRmResponseReadMap(lp);m[String(fingerprint||"")]=new Date().toISOString();
    localStorage.setItem("lp_rm_responses_cleared_v49_"+String(lp||"").toLowerCase(),JSON.stringify(m));
    return true;
  }catch(e){console.warn("Could not persist cleared RM response",e);return false;}
}
function ctRmResponseIsRead(lp,r){
  var cutoff=ctRmResponseClearThrough(lp),t=ctRmResponseTime(r);
  if(cutoff&&t&&t<=cutoff)return true;
  var m=ctRmResponseReadMap(lp);return !!m[ctRmResponseFingerprint(lp,r)];
}
function ctRmMarkResponsesRead(lp,rows){
  try{
    var m=ctRmResponseReadMap(lp),now=new Date().toISOString();
    (rows||[]).forEach(function(r){if(String(r&&r.rm_note||"").trim())m[ctRmResponseFingerprint(lp,r)]=now});
    var keys=Object.keys(m);if(keys.length>200){keys.sort(function(a,b){return String(m[b]).localeCompare(String(m[a]))});var keep={};keys.slice(0,150).forEach(function(k){keep[k]=m[k]});m=keep}
    localStorage.setItem("lp_rm_responses_cleared_v49_"+String(lp||"").toLowerCase(),JSON.stringify(m));
  }catch(e){console.warn("Could not save RM response clear state",e)}
}
function ctRmMarkAllResponsesRead(lp,rows){
  // Clear-through is intentionally based on the newest response timestamp. Anything newer later is NEW.
  try{
    var maxT=0;(rows||[]).forEach(function(r){if(String(r&&r.rm_note||"").trim())maxT=Math.max(maxT,ctRmResponseTime(r))});
    if(maxT)localStorage.setItem("lp_rm_responses_clear_through_v49_"+String(lp||"").toLowerCase(),String(maxT));
    ctRmMarkResponsesRead(lp,rows);
  }catch(e){console.warn("Could not clear RM response alerts",e)}
}
function ctRmHiddenSentinel(name){
  var s=String(name||"").trim().toLowerCase().replace(/\s+/g," ");
  var compact=s.replace(/[^a-z]/g,"");
  return compact==="hidden"||s==="__hidden__"||/^_+hidden_+$/.test(s)||s.indexOf("__hidden__")>=0;
}
function ctRmHiddenRow(r){
  if(!r)return true;
  var raw=String(r.agent_name||"");
  var shown="";try{shown=String(displayName(raw)||"")}catch(e){}
  return ctRmHiddenSentinel(raw)||ctRmHiddenSentinel(shown);
}
window._ctRmResponseRowsByLp=window._ctRmResponseRowsByLp||{};
window.ctOpenRmResponses=async function(lp){
  lp=lp||currentUser;
  if(!lp)return;
  try{
    if(currentUser!==lp&&["Gavin","Karen","Osgood","Jordan","Said","Isaak"].indexOf(lp)>=0){
      var btn=Array.from(document.querySelectorAll(".who-btn")).find(function(b){return String(b.textContent||"").trim()===lp});
      selectUser(btn||null,lp);
    }
    if(typeof ctLoadRecentRmResponses==="function")await ctLoadRecentRmResponses(lp);
  }catch(e){}
  setTimeout(function(){
    var details=document.getElementById("lp-rm-responses-details"),panel=document.getElementById("lp-rm-responses");
    if(details)details.open=true;
    if(panel)panel.scrollIntoView({behavior:"smooth",block:"center"});
  },80);
};
window.ctClearAllRmResponseAlerts=function(lp,e){
  if(e){try{e.preventDefault();e.stopPropagation();}catch(_){} }
  lp=lp||currentUser;
  var key=String(lp||"").toLowerCase();
  var rows=((window._ctRmResponseRowsByLp||{})[key]||[]).filter(function(r){return !ctRmHiddenRow(r)&&!!String(r.rm_note||"").trim();});
  // Clear THROUGH this exact moment. This makes every response already on screen leave the
  // active inbox, while a later RM response (timestamp newer than this) becomes NEW normally.
  try{localStorage.setItem("lp_rm_responses_clear_through_v49_"+key,String(Date.now()));}catch(_){ }
  ctRmMarkResponsesRead(lp,rows);
  var host=document.getElementById("lp-rm-responses-list"),panel=document.getElementById("lp-rm-responses"),badge=document.getElementById("lp-rm-response-badge"),clearAll=document.getElementById("lp-rm-response-clear-all"),summary=document.getElementById("lp-rm-response-summary"),details=document.getElementById("lp-rm-responses-details");
  if(host)host.innerHTML='<div style="padding:6px 0;color:#6B7E8A">No new RM replies. The tracker adds new replies here.</div>';
  if(panel){panel.style.background="#fff";panel.style.borderColor="#D7E0EA";panel.style.borderLeftColor="#071B37";panel.style.boxShadow="none";}
  if(badge)badge.style.display="none";if(clearAll)clearAll.style.display="none";if(summary)summary.textContent="No new RM responses.";if(details)details.open=false;
  if(typeof ctShowToast==="function")ctShowToast("RM response inbox cleared ✓");
  setTimeout(function(){Promise.resolve(ctLoadRecentRmResponses(lp)).finally(function(){if(typeof window.ctLoadNotifications==="function")window.ctLoadNotifications();});},40);
  return false;
};
window.ctClearOneRmResponseAlert=function(lp,fingerprint,e){
  if(e){try{e.preventDefault();e.stopPropagation();}catch(_){} }
  lp=lp||currentUser;fingerprint=String(fingerprint||"");
  var rows=(window._ctRmResponseRowsByLp||{})[String(lp||"").toLowerCase()]||[];
  var row=rows.find(function(r){return !ctRmHiddenRow(r)&&ctRmResponseFingerprint(lp,r)===fingerprint;});
  // Persist the clicked fingerprint DIRECTLY. A stale in-memory row list must never make a
  // visible Clear button fail.
  ctRmClearFingerprintDirect(lp,fingerprint);
  if(row)ctRmMarkResponsesRead(lp,[row]);

  // Remove the exact clicked card immediately for unambiguous feedback.
  try{
    var item=e&&e.target&&e.target.closest?e.target.closest('.lp-rm-response-item'):null;
    if(!item){var encoded=encodeURIComponent(fingerprint);item=document.querySelector('.lp-rm-response-item[data-rm-response-fp="'+encoded+'"]');}
    if(item)item.remove();
  }catch(_){ }
  if(typeof ctShowToast==="function")ctShowToast("RM response cleared ✓");
  setTimeout(function(){Promise.resolve(ctLoadRecentRmResponses(lp)).finally(function(){if(typeof window.ctLoadNotifications==="function")window.ctLoadNotifications();});},40);
  return false;
};

async function ctLoadRecentRmResponses(lp){
  var host=document.getElementById("lp-rm-responses-list");
  if(!host)return;
  var panel=document.getElementById("lp-rm-responses"),details=document.getElementById("lp-rm-responses-details"),badge=document.getElementById("lp-rm-response-badge"),summary=document.getElementById("lp-rm-response-summary"),openLabel=document.getElementById("lp-rm-response-open-label"),clearAll=document.getElementById("lp-rm-response-clear-all");
  host.innerHTML='<div style="padding:5px 0;color:#6B7E8A">Loading responses...</div>';
  if(badge)badge.style.display="none";
  if(clearAll)clearAll.style.display="none";
  try{
    var safeLp=encodeURIComponent(lp||"");
    var results=await Promise.all([
      sbFetch("GET","lp_flags?lp=eq."+safeLp+"&rm_note=not.is.null&select=id,agent_name,lp,note,rm_note,rm_note_at,rm_note_by,resolved,resolved_at,created_at&order=rm_note_at.desc&limit=30").catch(function(){return[];}),
      sbFetch("GET","lp_flags?lp=eq."+safeLp+"&resolved=eq.true&select=id,agent_name,lp,note,rm_note,rm_note_at,rm_note_by,resolved,resolved_at,created_at&order=resolved_at.desc&limit=30").catch(function(){return[];}),
      sbFetch("GET","call_logs?lp=eq."+safeLp+"&rm_note=not.is.null&select=id,agent_name,lp,note,rm_note,rm_note_at,flag_rm,call_date,outcome&order=rm_note_at.desc&limit=30").catch(function(){return[];})
    ]);
    var directMap={};
    function addDirect(r){
      if(!r||r.id===undefined||r.id===null||ctRmHiddenRow(r))return;
      var k=String(r.id),existing=directMap[k]||{};
      directMap[k]={
        source:"direct",id:r.id,agent_name:r.agent_name||existing.agent_name||"",flag_note:r.note||existing.flag_note||"",
        rm_note:r.rm_note||existing.rm_note||"",rm_note_at:r.rm_note_at||existing.rm_note_at||r.resolved_at||existing.handled_at||r.created_at||existing.created_at||"",
        rm_note_by:r.rm_note_by||existing.rm_note_by||"RM",handled:r.resolved===true||existing.handled===true,
        handled_at:r.resolved_at||existing.handled_at||null,created_at:r.created_at||existing.created_at||""
      };
    }
    (Array.isArray(results[0])?results[0]:[]).forEach(addDirect);
    (Array.isArray(results[1])?results[1]:[]).forEach(addDirect);
    var direct=Object.keys(directMap).map(function(k){return directMap[k];});
    var legacy=(Array.isArray(results[2])?results[2]:[]).filter(function(r){return !ctRmHiddenRow(r);}).map(function(r){
      return{source:"call",id:r.id,agent_name:r.agent_name||"",flag_note:r.note||"",rm_note:r.rm_note||"",rm_note_at:r.rm_note_at||r.call_date||"",rm_note_by:"RM",handled:r.flag_rm!==true,handled_at:null,created_at:r.call_date||"",outcome:r.outcome||""};
    });
    var rows=direct.concat(legacy).filter(function(r){return !ctRmHiddenRow(r)&&!!String(r.rm_note||"").trim();});
    rows.sort(function(a,b){var ad=a.rm_note_at||a.handled_at||a.created_at||"",bd=b.rm_note_at||b.handled_at||b.created_at||"";return String(bd).localeCompare(String(ad));});
    rows=rows.slice(0,15);

    // Keep the full fetched set in memory so Clear can match the clicked response,
    // but the visible panel is an ACTION INBOX: once the LP clears a response,
    // that response disappears from this panel. The underlying database record is untouched.
    window._ctRmResponseRowsByLp[String(lp||"").toLowerCase()]=rows;
    var visibleRows=rows.filter(function(r){return !ctRmResponseIsRead(lp,r);});

    if(!visibleRows.length){
      if(panel){panel.style.background="#fff";panel.style.borderColor="#D7E0EA";panel.style.borderLeftColor="#071B37";panel.style.boxShadow="none";}
      if(badge)badge.style.display="none";
      if(clearAll)clearAll.style.display="none";
      if(summary)summary.textContent="No new RM responses.";
      if(openLabel)openLabel.textContent="View responses ▾";
      if(details)details.open=false;
      host.innerHTML='<div style="padding:6px 0;color:#6B7E8A">No new RM replies. The tracker adds new replies here.</div>';
      return [];
    }

    var actualReplies=visibleRows;
    var unread=visibleRows;
    if(panel){
      panel.style.background=unread.length?"#FFF6F6":"#fff";
      panel.style.borderColor=unread.length?"#DE8888":"#D7E0EA";
      panel.style.borderLeftColor=unread.length?"#C83D3D":"#071B37";
      panel.style.boxShadow=unread.length?"0 0 0 2px rgba(200,61,61,.08)":"none";
    }
    if(badge){badge.style.display=unread.length?"inline-flex":"none";badge.textContent=unread.length+" NEW";}
    if(clearAll){clearAll.style.display=unread.length?"inline-block":"none";clearAll.textContent=unread.length===1?"Clear response":"Clear all responses";}
    if(summary)summary.textContent=unread.length
      ?unread.length+" new RM response"+(unread.length===1?"":"s")+" from Amanda/Nyny — stays red until you clear it."
      :actualReplies.length+" recent RM response"+(actualReplies.length===1?"":"s")+" — no unread alerts.";
    if(openLabel)openLabel.textContent=unread.length?"Open response"+(unread.length===1?"":"s")+" ▾":"View responses ▾";

    var html='<div style="max-height:320px;overflow-y:auto;padding-right:3px">';
    visibleRows.forEach(function(r,i){
      var agent=r.agent_name?displayName(r.agent_name):"General flag",when=r.rm_note_at?fmt(String(r.rm_note_at).slice(0,10)):"",by=r.rm_note_by||"RM";
      var flagText=String(r.flag_note||"").trim(),response=String(r.rm_note||"").trim(),missingResponse=r.handled&&!response;
      var isUnread=!!response,fp=ctRmResponseFingerprint(lp,r);
      var status=missingResponse?"Handled · no response saved":(r.handled?"Handled":"Reply sent · still open");
      var statusColor=missingResponse?"#6B5E3E":(r.handled?"#15803d":"#B7791F"),statusBg=missingResponse?"#F8F3E7":(r.handled?"#ECFDF3":"#FFF8E8");
      html+='<div class="lp-rm-response-item" data-rm-response-fp="'+encodeURIComponent(fp)+'" style="padding:10px '+(isUnread?'10px':'0')+';'+(i&&!isUnread?'border-top:1px solid #E7EFF3;':'')+(isUnread?'margin:6px 0;border:1px solid #DE8888;border-left:4px solid #C83D3D;border-radius:8px;background:#FFF9F9;':'')+'">'
        +'<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">'
          +'<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><div style="font-size:13px;font-weight:800;color:#071B37">'+escHtml(agent)+'</div>'
          +(isUnread?'<span class="lp-rm-response-new" style="font-size:8.8px;font-weight:900;color:#A12727;background:#FFF1F1;border:1px solid #E3A0A0;border-radius:999px;padding:2px 6px">NEW</span>':'')+'</div>'
          +'<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><div style="font-size:10.5px;font-weight:800;color:'+statusColor+';background:'+statusBg+';border-radius:999px;padding:3px 8px">'+status+'</div>'
          +(isUnread?'<button type="button" class="lp-rm-response-clear-one" data-rm-clear-fp="'+encodeURIComponent(fp)+'">Clear</button>':'')+'</div>'
        +'</div>'
        +(flagText?'<div style="font-size:11.5px;color:#526575;margin-top:5px;line-height:1.45"><span style="font-weight:700">Your flag:</span> '+escHtml(flagText)+'</div>':'')
        +(missingResponse
          ?'<div style="margin-top:6px;background:#FAF7EF;border:1px solid #E7DCC3;border-radius:7px;padding:8px 10px"><div style="font-size:10.5px;font-weight:800;color:#6B5E3E;margin-bottom:3px">Handled'+(when?' · '+escHtml(when):'')+'</div><div style="font-size:12px;color:#526575;line-height:1.5">No RM response was recorded before this flag was handled.</div></div>'
          :'<div style="margin-top:6px;background:#F3F8F3;border:1px solid #CFE5D2;border-radius:7px;padding:8px 10px"><div style="font-size:10.5px;font-weight:800;color:#071B37;margin-bottom:3px">RM response'+(by?' · '+escHtml(by):'')+(when?' · '+escHtml(when):'')+'</div><div style="font-size:12.5px;color:#243124;line-height:1.5">'+escHtml(response)+'</div></div>')
      +'</div>';
    });
    html+='</div><div style="font-size:10.5px;color:#6B7E8A;margin-top:7px">RM responses stay here until you explicitly clear them after reviewing/handling the next step. Clearing removes them from this action inbox only; the original RM record is preserved.</div>';
    host.innerHTML=html;
    if(details)details.dataset.lp=lp||"";

    // v50: explicit event wiring. Inline handlers were being broken by nested
    // quote characters in generated fingerprints, so Clear looked clickable
    // but the browser never received a valid function call.
    host.querySelectorAll('.lp-rm-response-clear-one').forEach(function(btn){
      btn.onclick=function(ev){
        try{ev.preventDefault();ev.stopPropagation();}catch(_){ }
        var fp='';try{fp=decodeURIComponent(btn.getAttribute('data-rm-clear-fp')||'')}catch(_){fp=btn.getAttribute('data-rm-clear-fp')||''}
        return window.ctClearOneRmResponseAlert(lp,fp,ev);
      };
    });
    if(clearAll){
      clearAll.onclick=function(ev){
        try{ev.preventDefault();ev.stopPropagation();}catch(_){ }
        return window.ctClearAllRmResponseAlerts(lp,ev);
      };
    }
    return unread;
  }catch(e){
    console.error("RM response history failed",e);
    host.innerHTML='<div style="padding:6px 0;color:#A32D2D">Could not load RM responses. Refresh or try again in a moment.</div>';
    return [];
  }
}
window.ctLoadRecentRmResponses=ctLoadRecentRmResponses;


window._ctRmUpdateRowsByLp=window._ctRmUpdateRowsByLp||{};
function ctRmClearUpdateFingerprintDirect(lp,fingerprint){
  try{
    var m=ctRmReadMap(lp);m[String(fingerprint||"")]=new Date().toISOString();
    localStorage.setItem("lp_rm_notes_read_"+String(lp||"").toLowerCase(),JSON.stringify(m));
    return true;
  }catch(e){console.warn("Could not persist cleared RM update",e);return false;}
}
window.ctClearOneRmUpdateAlert=function(lp,fingerprint,e){
  if(e){try{e.preventDefault();e.stopPropagation();}catch(_){} }
  lp=lp||currentUser;fingerprint=String(fingerprint||"");
  var rows=(window._ctRmUpdateRowsByLp||{})[String(lp||"").toLowerCase()]||[];
  var row=rows.find(function(a){return ctRmNoteFingerprint(lp,a)===fingerprint;});
  ctRmClearUpdateFingerprintDirect(lp,fingerprint);
  if(row)ctRmMarkDisplayedRead(lp,[row]);
  try{var item=e&&e.target&&e.target.closest?e.target.closest('.lp-rm-note-item'):null;if(item)item.remove();}catch(_){}
  if(typeof ctShowToast==="function")ctShowToast("RM update cleared ✓");
  setTimeout(function(){Promise.resolve(ctLoadRecentRmRelationshipNotes(lp)).finally(function(){if(typeof window.ctLoadNotifications==="function")window.ctLoadNotifications();});},40);
  return false;
};
window.ctClearAllRmUpdateAlerts=function(lp,e){
  if(e){try{e.preventDefault();e.stopPropagation();}catch(_){} }
  lp=lp||currentUser;
  var rows=(window._ctRmUpdateRowsByLp||{})[String(lp||"").toLowerCase()]||[];
  var active=rows.filter(function(a){return !ctRmIsRead(lp,a);});
  ctRmMarkDisplayedRead(lp,active);
  var host=document.getElementById("lp-rm-relationship-notes-list"),panel=document.getElementById("lp-rm-relationship-notes"),badge=document.getElementById("lp-rm-note-badge"),clearAll=document.getElementById("lp-rm-note-clear-all"),summary=document.getElementById("lp-rm-note-summary"),details=document.getElementById("lp-rm-relationship-notes-details");
  if(host)host.innerHTML='<div style="padding:6px 0;color:#6B7E8A">No new RM relationship updates. The tracker adds new updates here.</div>';
  if(panel){panel.style.background="#fff";panel.style.borderColor="#D7E4E9";panel.style.borderLeftColor="#9BBBC5";panel.style.boxShadow="none";}
  if(badge)badge.style.display="none";if(clearAll)clearAll.style.display="none";if(summary)summary.textContent="No new RM updates.";if(details)details.open=false;
  if(typeof ctShowToast==="function")ctShowToast("RM updates cleared ✓");
  setTimeout(function(){if(typeof window.ctLoadNotifications==="function")window.ctLoadNotifications();},40);
  return false;
};

async function ctLoadRecentRmRelationshipNotes(lp){
  var host=document.getElementById("lp-rm-relationship-notes-list");if(!host)return;
  var panel=document.getElementById("lp-rm-relationship-notes"),details=document.getElementById("lp-rm-relationship-notes-details"),badge=document.getElementById("lp-rm-note-badge"),summary=document.getElementById("lp-rm-note-summary"),clearAll=document.getElementById("lp-rm-note-clear-all"),openLabel=document.getElementById("lp-rm-note-open-label");
  host.innerHTML='<div style="padding:5px 0;color:#6B7E8A">Loading RM updates...</div>';
  if(badge)badge.style.display="none";if(clearAll)clearAll.style.display="none";
  try{
    var safeLp=encodeURIComponent(lp||""),cut=new Date();cut.setDate(cut.getDate()-45);var cutStr=localDateStr(cut);
    var results=await Promise.all([
      sbFetch("GET","agent_assignments?lp=eq."+safeLp+"&select=agent_name&limit=1000").catch(function(){return[];}),
      sbFetch("GET","amanda_activities?act_date=gte."+cutStr+"&select=id,agent_name,act_type,act_date,notes,outcome,follow_up_date,created_at&order=act_date.desc,created_at.desc&limit=1500").catch(function(){return[];})
    ]);
    var assigned={};(results[0]||[]).forEach(function(r){assigned[String(r.agent_name||"").trim().toUpperCase()]=true;});
    var rows=(results[1]||[]).filter(function(a){
      var k=String(a.agent_name||"").trim().toUpperCase();
      if(!assigned[k]||!String(ctStripRmMeta(a.notes)||"").trim())return false;
      if(typeof lpIsInternalRmActivity==="function"&&lpIsInternalRmActivity(a))return false;
      return !ctIsDirectorLeadership(a.act_type);
    }).slice(0,30);

    window._ctRmUpdateRowsByLp[String(lp||"").toLowerCase()]=rows;
    var visibleRows=rows.filter(function(a){return !ctRmIsRead(lp,a);}).slice(0,15);

    if(!visibleRows.length){
      if(panel){panel.style.background="#fff";panel.style.borderColor="#D7E4E9";panel.style.borderLeftColor="#9BBBC5";panel.style.boxShadow="none";}
      if(badge)badge.style.display="none";if(clearAll)clearAll.style.display="none";
      if(summary)summary.textContent="No new RM updates.";
      if(openLabel)openLabel.textContent="View updates ▾";
      if(details)details.open=false;
      host.innerHTML='<div style="padding:6px 0;color:#6B7E8A">No new RM relationship updates. The tracker adds new updates here.</div>';
      return [];
    }

    if(panel){panel.style.background="#FFFDFD";panel.style.borderColor="#E4B7B7";panel.style.borderLeftColor="#C83D3D";panel.style.boxShadow="none";}
    if(badge){badge.style.display="inline-flex";badge.textContent=visibleRows.length+" NEW";}
    if(clearAll){clearAll.style.display="inline-block";clearAll.textContent=visibleRows.length===1?"Clear update":"Clear all reviewed";}
    if(summary)summary.textContent=visibleRows.length+" RM update"+(visibleRows.length===1?"":"s")+" waiting for review/action.";
    if(openLabel)openLabel.textContent="Open update"+(visibleRows.length===1?"":"s")+" ▾";
    if(details)details.open=false;

    host.innerHTML='<div style="max-height:360px;overflow-y:auto;padding-right:3px">'+visibleRows.map(function(a){
      var owner=ctRmOwnerFromNotes(a.notes)||"RM",date=a.act_date?fmt(a.act_date):"",fp=ctRmNoteFingerprint(lp,a);
      return'<div class="lp-rm-note-item" data-rm-update-fp="'+encodeURIComponent(fp)+'" style="margin:0 0 7px;padding:9px 10px;border:1px solid #E4B7B7;border-left:4px solid #C83D3D;border-radius:8px;background:#FFFDFD">'
        +'<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">'
          +'<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><div style="font-size:13px;font-weight:850;color:#071B37">'+escHtml(displayName(a.agent_name||"Agent"))+'</div><span style="font-size:8.8px;font-weight:900;color:#A12727;background:#FFF1F1;border:1px solid #E3A0A0;border-radius:999px;padding:2px 6px">NEW</span></div>'
          +'<div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap"><div style="font-size:10.3px;color:#687E88;font-weight:600">'+escHtml(owner)+' · '+escHtml(a.act_type||"RM touch")+(date?' · '+escHtml(date):'')+'</div><button type="button" class="lp-rm-note-clear-one" data-rm-update-clear-fp="'+encodeURIComponent(fp)+'">Clear</button></div>'
        +'</div>'
        +'<div style="margin-top:6px">'+ctRmPrettyNote(a.notes,a.act_type)+'</div>'
        +(a.outcome?'<div style="font-size:10.3px;color:#687E88;margin-top:5px"><strong>Outcome:</strong> '+escHtml(a.outcome)+(a.follow_up_date?' · <strong>Follow-up:</strong> '+escHtml(fmt(a.follow_up_date)):'')+'</div>':'')
        +'</div>';
    }).join("")+'</div>'
    +'<div style="font-size:10.3px;color:#748791;margin-top:7px">Use this as an action inbox: review what Amanda/Nyny sent, complete the needed follow-up, then Clear it. Clearing does not delete the RM history.</div>';

    host.querySelectorAll('.lp-rm-note-clear-one').forEach(function(btn){
      btn.onclick=function(ev){
        try{ev.preventDefault();ev.stopPropagation();}catch(_){}
        var fp='';try{fp=decodeURIComponent(btn.getAttribute('data-rm-update-clear-fp')||'')}catch(_){fp=btn.getAttribute('data-rm-update-clear-fp')||''}
        return window.ctClearOneRmUpdateAlert(lp,fp,ev);
      };
    });
    if(clearAll){clearAll.onclick=function(ev){try{ev.preventDefault();ev.stopPropagation();}catch(_){}return window.ctClearAllRmUpdateAlerts(lp,ev);};}
    return visibleRows;
  }catch(e){
    console.error("RM relationship notes failed",e);
    host.innerHTML='<div style="padding:6px 0;color:#A32D2D">Could not load RM updates.</div>';
    return [];
  }
}
window.ctLoadRecentRmRelationshipNotes=ctLoadRecentRmRelationshipNotes;

async function ctLoadRmFlagsForLp(lp){
  var panel=document.getElementById("lp-rm-flags-for-you"),host=document.getElementById("lp-rm-flags-for-you-list");if(!panel||!host)return;
  try{
    var rows=await sbFetch("GET","rm_lp_flags?lp=eq."+encodeURIComponent(lp||"")+"&select=*&order=created_at.desc&limit=30").catch(function(){return[];});
    rows=Array.isArray(rows)?rows:[];
    if(!rows.length){panel.style.display="none";host.innerHTML="";return;}
    panel.style.display="block";
    var open=rows.filter(function(r){return r.resolved!==true;}),handled=rows.filter(function(r){return r.resolved===true;}).slice(0,6);
    var flagBadge=document.getElementById("lp-rm-flag-badge");
    if(flagBadge){flagBadge.style.display=open.length?"inline-flex":"none";flagBadge.textContent=open.length+" ACTION"+(open.length===1?"":"S")+" NEEDED";}
    panel.style.background=open.length?"#FFFDFD":"#fff";
    panel.style.borderColor=open.length?"#E4B7B7":"#D7E0EA";
    panel.style.borderLeftColor=open.length?"#C83D3D":"#071B37";
    var html="";
    if(open.length){
      html+='<div style="font-size:10.5px;font-weight:850;color:#A12727;text-transform:uppercase;letter-spacing:.04em;margin:4px 0 6px">Action needed · '+open.length+'</div>';
      html+=open.map(function(r,i){
        var rid=String(r.id),reply=String(r.lp_note||""),date=String(r.created_at||"").slice(0,10);
        return'<div style="padding:9px 0;'+(i?'border-top:1px solid #F0E4C2;':'')+'"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><strong style="font-size:12.5px;color:#352D1D">'+escHtml(displayName(r.agent_name||"General"))+'</strong><div style="font-size:10.5px;color:#7B6E52;margin-top:2px">From '+escHtml(r.created_by||"RM")+(date?' · '+escHtml(fmt(date)):'')+'</div></div><span style="font-size:9.5px;font-weight:850;color:#A12727;background:#FFF1F1;border:1px solid #E3A0A0;border-radius:999px;padding:3px 7px">OPEN</span></div><div style="font-size:12px;color:#514A3A;line-height:1.5;margin-top:5px"><strong>RM note:</strong> '+escHtml(r.note||"")+'</div><textarea id="rm-lp-reply-'+rid+'" rows="2" placeholder="Reply back to RM..." style="width:100%;box-sizing:border-box;margin-top:7px;border:1px solid #DDCFA8;border-radius:7px;padding:7px 9px;font-size:12px;font-family:inherit;resize:vertical">'+escHtml(reply)+'</textarea><div style="display:flex;gap:7px;justify-content:flex-end;margin-top:6px"><button type="button" onclick="ctReplyToRmFlag('+JSON.stringify(rid)+','+JSON.stringify(lp)+')" style="border:1px solid #D7B85E;background:#FFF8E8;color:#745000;border-radius:6px;padding:5px 9px;font-size:11px;font-weight:800;cursor:pointer">Send reply</button><button type="button" onclick="ctHandleRmFlag('+JSON.stringify(rid)+','+JSON.stringify(lp)+')" style="border:0;background:#071B37;color:#fff;border-radius:6px;padding:5px 9px;font-size:11px;font-weight:800;cursor:pointer">Mark handled</button></div></div>';
      }).join("");
    }else html+='<div style="font-size:11.5px;color:#6C6252;padding:4px 0">No open RM flags for you right now.</div>';
    if(handled.length){
      html+='<details style="margin-top:8px"><summary style="cursor:pointer;font-size:11px;font-weight:800;color:#6C6252">Recently handled ('+handled.length+')</summary><div style="margin-top:5px">'+handled.map(function(r){var dt=String(r.resolved_at||r.created_at||"").slice(0,10);return'<div style="padding:7px 0;border-top:1px solid #F0EADF"><div style="font-size:11.5px;font-weight:700;color:#514A3A">'+escHtml(displayName(r.agent_name||"General"))+' <span style="font-size:10px;color:#15803d">✓ Handled</span></div><div style="font-size:11px;color:#6C6252;margin-top:2px"><strong>RM:</strong> '+escHtml(r.note||"")+'</div>'+(r.lp_note?'<div style="font-size:11px;color:#315B40;margin-top:2px"><strong>Your reply:</strong> '+escHtml(r.lp_note)+'</div>':'')+(dt?'<div style="font-size:9.5px;color:#8A806C;margin-top:2px">'+escHtml(fmt(dt))+'</div>':'')+'</div>';}).join("")+'</div></details>';
    }
    host.innerHTML=html;
  }catch(e){console.error("RM→LP flags failed",e);panel.style.display="none";}
}
window.ctLoadRmFlagsForLp=ctLoadRmFlagsForLp;
async function ctReplyToRmFlag(id,lp){
  var ta=document.getElementById("rm-lp-reply-"+id),note=(ta?ta.value:"").trim();if(!note){ctShowToast("Add a reply first");return;}
  try{await sbFetch("PATCH","rm_lp_flags?id=eq."+encodeURIComponent(id),{lp_note:note,lp_note_at:new Date().toISOString(),lp_note_by:lp});ctShowToast("Reply sent to RM ✓");ctLoadRmFlagsForLp(lp);if(typeof window.ctLoadNotifications==="function")window.ctLoadNotifications();}catch(e){ctShowToast("Reply failed — check RM↔LP handoff setup");}
}
window.ctReplyToRmFlag=ctReplyToRmFlag;
async function ctHandleRmFlag(id,lp){
  try{
    var rows=await sbFetch("GET","rm_lp_flags?id=eq."+encodeURIComponent(id)+"&select=lp_note&limit=1").catch(function(){return[];});
    if(!rows||!rows[0]||!String(rows[0].lp_note||"").trim()){ctShowToast("Send a quick reply to RM before marking handled");return;}
    await sbFetch("PATCH","rm_lp_flags?id=eq."+encodeURIComponent(id),{resolved:true,resolved_at:new Date().toISOString()});ctShowToast("Marked handled ✓");ctLoadRmFlagsForLp(lp);if(typeof window.ctLoadNotifications==="function")window.ctLoadNotifications();
  }catch(e){ctShowToast("Could not mark handled");}
}
window.ctHandleRmFlag=ctHandleRmFlag;

function renderLpFaceTimeFocus(lp){
  var el=document.getElementById("lp-facetime-focus");if(!el)return;
  if(lp==="Isaak"){el.style.display="none";el.innerHTML="";return;}
  if(!Object.keys(ftData||{}).length){el.style.display="none";return;}
  var list=ftPriorityForLp(lp,3);if(!list.length){el.style.display="none";return;}
  el.style.display="block";
  var html='<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:7px"><div><div style="font-size:12.5px;font-weight:800;color:#071B37">Face Time — your next 3</div><div style="font-size:11px;color:var(--text-2);margin-top:1px">Start with these 3 Face Time priorities.</div></div><button type="button" onclick="selectUser(document.querySelector(\'.wb-FaceTime\'),\'FaceTime\')" style="border:0;background:transparent;color:#071B37;font-size:11px;font-weight:800;cursor:pointer">Open Face Time →</button></div>';
  list.forEach(function(a){
    var due=a.days===null?'Book first visit':(a.days>a.target?'Overdue '+(a.days-a.target)+'d':a.days===a.target?'Due today':'Due in '+(a.target-a.days)+'d');
    html+='<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 0;border-top:1px solid #E7EFF3"><div style="font-size:12px;font-weight:700;color:var(--text-1)">'+displayName(a.name)+' <span style="font-size:9px;color:#6B7E8A">'+a.tier+'</span></div><div style="font-size:11px;color:'+(a.days===null||a.days>=a.target?'#A32D2D':'#5C4A35')+';font-weight:700">'+due+'</div></div>';
  });
  el.innerHTML=html;
}

function renderFaceTime(){
  var listEl=document.getElementById("ft-list");if(!listEl)return;
  var lpF=(document.getElementById("ft-lp-filter")||{value:"all"}).value;
  var tierF=(document.getElementById("ft-tier-filter")||{value:"all"}).value;
  var statusF=(document.getElementById("ft-status-filter")||{value:"all"}).value;
  var comktF=(document.getElementById("ft-comkt-filter")||{value:"all"}).value;
  var now=new Date();

  var agentList=ftAgentRows();

  if(lpF!=="all")agentList=agentList.filter(function(a){return a.lp===lpF;});
  if(tierF!=="all")agentList=agentList.filter(function(a){return a.tier===tierF;});
  if(statusF==="critical")agentList=agentList.filter(function(a){return a.status==="critical";});
  else if(statusF==="overdue")agentList=agentList.filter(function(a){return a.status==="critical"||a.status==="red";});
  else if(statusF==="warn")agentList=agentList.filter(function(a){return a.status!=="ok";});
  if(comktF==="yes")agentList=agentList.filter(function(a){return a.coMkt;});
  else if(comktF==="no")agentList=agentList.filter(function(a){return !a.coMkt;});

  agentList.sort(function(a,b){if(!!a.scheduled!==!!b.scheduled)return a.scheduled?1:-1;return (b.priorityScore-a.priorityScore)||String(a.name).localeCompare(String(b.name));});

  var fullRows=ftAgentRows();
  var monthStart=new Date(now.getFullYear(),now.getMonth(),1);var monthStartStr=monthStart.getFullYear()+"-"+String(monthStart.getMonth()+1).padStart(2,"0")+"-01";
  var mtdKeys={};(ftVisitRows||[]).forEach(function(v){if(v.date&&v.date>=monthStartStr)mtdKeys[String(v.agent_name||"").trim().toUpperCase()+"|"+v.date]=true;});
  var mtd=Object.keys(mtdKeys).length;
  var dueWeek=fullRows.filter(function(a){if(a.days===null)return false;var left=a.target-a.days;return left>=0&&left<=7;}).length;
  var okCount=fullRows.filter(function(a){return a.status==="ok";}).length;
  var mtdEl=document.getElementById("ft-s-mtd");if(mtdEl)mtdEl.textContent=window.CT_FT_VISITS_LOADED?mtd:"—";
  var dueEl=document.getElementById("ft-s-dueweek");if(dueEl)dueEl.textContent=window.CT_FT_ROSTER_LOADED?dueWeek:"—";
  var okEl=document.getElementById("ft-s-ok");if(okEl)okEl.textContent=window.CT_FT_ROSTER_LOADED?okCount:"—";
  renderFtPriority();
  renderFtActionWorklist();

  if(!agentList.length){listEl.innerHTML='<div style="text-align:center;color:var(--text-4);padding:30px">No agents match these filters (or source roster is unavailable)</div>';return;}

  var tierColors={Channel:"#1E3A8A",A:"#B45309",B:"#1D4ED8",C:"#64748B"};
  var lpColors={Gavin:"#3D4E68",Karen:"#3D4E68",Osgood:"#3D4E68",Jordan:"#3D4E68",Said:"#3D4E68",Isaak:"#3D4E68"};
  // Group by next action rather than tier. Keep tier visible on every row.
  // A booked appointment does not mean a visit has happened; it stays in the booked lane.
  var laneFor=function(a){
    if(a.scheduled)return"booked";
    if(a.days===null||a.days>=a.target-7)return"attention";
    return"track";
  };
  var lanes=[
    {id:"attention",title:"Needs attention",help:"No visit recorded, overdue, or due within 7 days",color:"#b53832"},
    {id:"booked",title:"Visits booked",help:"Scheduled visits waiting to happen",color:"#286548"},
    {id:"track",title:"On track",help:"Next visit is more than 7 days away",color:"#37617c"}
  ];
  var rows=[],laneCounts={attention:0,booked:0,track:0};
  lanes.forEach(function(lane){
    var members=agentList.filter(function(a){return laneFor(a)===lane.id;});
    laneCounts[lane.id]=members.length;
    if(!members.length)return;
    members.sort(function(a,b){
      if(lane.id==="booked")return String(a.scheduled.event_date||"").localeCompare(String(b.scheduled.event_date||""))||String(a.name).localeCompare(String(b.name));
      if(lane.id==="attention"){var gapA=a.days===null?999:a.days-a.target,gapB=b.days===null?999:b.days-b.target;return gapB-gapA||(b.priorityScore-a.priorityScore)||String(a.name).localeCompare(String(b.name));}
      return (a.target-a.days)-(b.target-b.days)||String(a.name).localeCompare(String(b.name));
    });
    rows.push({type:"hdr",lane:lane,count:members.length});
    members.forEach(function(a,i){
      var target=a.target;
      var nextLabel=a.days===null?"First visit needed":a.days<target?"Due in "+(target-a.days)+"d":a.days===target?"Due today":"Overdue "+(a.days-target)+"d";
      rows.push({type:"agent",a:a,target:target,nextLabel:nextLabel,overdue:!a.scheduled&&(a.days===null||a.days>target),lc:lpColors[a.lp]||"#888",formId:"ftf"+lane.id+i});
    });
  });

  // Build HTML string — all onclick use data attrs, no dynamic string in onclick
  var html2='<div class="ft-lane-summary"><span><b>'+laneCounts.attention+'</b> need attention</span><span><b>'+laneCounts.booked+'</b> booked</span><span><b>'+laneCounts.track+'</b> on track</span></div>';
  rows.forEach(function(r){
    if(r.type==="hdr"){
      html2+='<div class="ft-tier-hdr ft-lane-head" style="color:'+r.lane.color+';border-color:'+r.lane.color+'"><strong>'+r.lane.title+' ('+r.count+')</strong><span>'+r.lane.help+'</span></div>';
    } else {
      var a=r.a,fid=r.formId;
      var coBadge=a.coMkt?'<span class="co-mkt-tag" style="cursor:pointer" data-name="'+escHtml(a.name)+'" data-active="true">Co-marketing ✓</span>':'<span class="ft-comkt-off" data-name="'+escHtml(a.name)+'" data-active="false" style="cursor:pointer;font-size:10px;color:var(--text-3);border:1px dashed var(--border);border-radius:4px;padding:2px 8px">+ Co-marketing</span>';
      var rowStyle=a.coMkt?' style="background:#FAF7F2;border-left:3px solid #B45309;padding-left:8px;margin-left:-11px"':'';
      html2+='<div class="ft-row" data-agent="'+escHtml(a.name)+'"'+rowStyle+'>'
        +'<div class="ft-name"><button type="button" class="ft-inline-name" data-agent="'+escHtml(a.name)+'" data-lp="'+escHtml(a.lp)+'" style="background:none;border:0;padding:0;font:inherit;color:#155d85;text-decoration:underline;cursor:pointer;text-align:left">'+escHtml(displayName(a.name))+'</button><small class="ft-agent-context">'+escHtml(a.tier==='Channel'?'Channel':a.tier+'-Tier')+' · Every '+r.target+' days'+(a.priorityWhy?' · '+escHtml(a.priorityWhy):'')+'</small></div>'
        +'<span style="font-size:11px;font-weight:600;color:'+r.lc+';min-width:50px">'+a.lp+'</span>'
        +'<span class="ft-days '+a.status+'">'+(a.days===null?"No visit":a.days===0?"Today":a.days+"d ago")+'</span>'
        +'<span class="ft-meta">'+(a.lastDate?"Last visit: "+fmtDate(a.lastDate)+(a.source?" · "+escHtml(displayName(a.source)):""):"No visits logged")+'</span>'
        +'<span class="ft-meta ft-due-label" style="color:'+(a.scheduled?"#365342":(r.overdue?"#DC2626":"#0A6B4C"))+'">'+(a.scheduled?('Booked '+fmtDate(a.scheduled.event_date)+(a.scheduled.event_time?' · '+String(a.scheduled.event_time).slice(0,5):'')):r.nextLabel)+'</span>'
        +'<span class="ft-comkt-toggle">'+coBadge+'</span>'
        +'<span style="display:flex;gap:5px"><button class="ft-book-btn" data-agent="'+escHtml(a.name)+'" data-lp="'+escHtml(a.lp)+'" data-id="'+escHtml(String(a.scheduled&&a.scheduled.id||""))+'" style="background:#F4F8F4;color:#365342;border:1px solid #BFD1C2;border-radius:6px;padding:4px 9px;font-size:10px;font-weight:700;cursor:pointer;white-space:nowrap">'+(a.scheduled?'Open':'Book')+'</button><button class="ft-log-btn btn-ft-log" data-fid="'+fid+'" style="background:var(--brand);color:#fff;border:none;border-radius:6px;padding:4px 9px;font-size:10px;font-weight:600;cursor:pointer;white-space:nowrap">Log visit</button></span>'
        +'</div>'
        +'<div class="ft-log-form" id="'+fid+'">'
          +'<div style="font-size:11px;font-weight:600;color:var(--brand);margin-bottom:8px">Log partner visit — '+escHtml(displayName(a.name))+'</div>'
          +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">'
            +'<div><label style="font-size:10px;color:var(--text-3);font-weight:600;display:block;margin-bottom:3px;text-transform:uppercase">Date</label>'
            +'<input type="date" id="'+fid+'-date" value="'+today2()+'" style="width:100%;border:1px solid var(--border);border-radius:6px;padding:6px 9px;font-size:12px;font-family:inherit"></div>'
            +'<div><label style="font-size:10px;color:var(--text-3);font-weight:600;display:block;margin-bottom:3px;text-transform:uppercase">Logged by</label>'
            +'<select id="'+fid+'-by" style="width:100%;border:1px solid var(--border);border-radius:6px;padding:6px 9px;font-size:12px;font-family:inherit"><option>Nyny</option><option>Amanda</option><option>Gavin</option><option>Jordan</option><option>Karen</option><option>Osgood</option><option>Said</option><option>Isaak</option></select></div>'
          +'</div>'
          +'<textarea id="'+fid+'-notes" placeholder="What did you talk about? Any referral opportunities discussed, next steps, what they need from us..." style="width:100%;border:1px solid var(--border);border-radius:6px;padding:7px 9px;font-size:12px;font-family:inherit;resize:vertical;min-height:72px;margin-bottom:8px;box-sizing:border-box"></textarea>'
          +'<div style="display:flex;gap:7px">'
            +'<button class="ft-save-btn" data-agent="'+a.name.replace(/"/g,"&quot;")+'" data-fid="'+fid+'" style="background:var(--brand);color:#fff;border:none;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer">Save</button>'
            +'<button class="ft-cancel-btn" data-fid="'+fid+'" style="background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer">Cancel</button>'
          +'</div>'
        +'</div>';
    }
  });
  listEl.innerHTML=html2;

  // Attach events after render (avoids all inline onclick issues)
  listEl.querySelectorAll(".ft-log-btn,.ft-cancel-btn").forEach(function(btn){
    btn.addEventListener("click",function(){ftToggleLog(this.dataset.fid);});
  });
  listEl.querySelectorAll(".ft-inline-name").forEach(function(btn){btn.addEventListener("click",function(){ftOpenAgentRow(this.dataset.agent,this.dataset.lp);});});
  listEl.querySelectorAll(".ft-book-btn").forEach(function(btn){btn.addEventListener("click",function(){v33OpenSharedFaceTime(this.dataset.agent,this.dataset.lp,this.dataset.id||"");});});
  listEl.querySelectorAll(".ft-save-btn").forEach(function(btn){
    btn.addEventListener("click",function(){ftSaveLog(this.dataset.agent,this.dataset.fid);});
  });
  listEl.querySelectorAll(".co-mkt-tag,.ft-comkt-off").forEach(function(el){
    el.addEventListener("click",function(){ftToggleCoMarketing(this.dataset.name,this.dataset.active==="true");});
  });
}

function ftToggleCoMarketing(name,isActive){
  if(coMarketingIsBilled(name)){showToast("Active billing partnership: edit in Co-Marketing Relationships","error");return;}
  var newVal=!isActive;
  coMarketingAgents[coMarketingKey(name)]=newVal;
  sbFetch("GET","agent_profiles?agent_name=eq."+encodeURIComponent(name)+"&limit=1").then(function(res){
    var method=(res&&res.length)?"PATCH":"POST";
    var path=method==="PATCH"?"agent_profiles?agent_name=eq."+encodeURIComponent(name):"agent_profiles";
    return sbFetch(method,path,{agent_name:name,co_marketing:newVal});
  }).then(function(){
    renderFaceTime();
    showToast((newVal?"Marked":"Unmarked")+" "+name+" as co-marketing","success");
  }).catch(function(){
    coMarketingAgents[coMarketingKey(name)]=isActive; // revert on failure
    showToast("Save failed — try again","error");
  });
}


function today2(){
  var d=new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}

function ftToggleLog(id){
  var el=document.getElementById(id);if(!el)return;
  el.classList.toggle("show");
  if(el.classList.contains("show"))el.scrollIntoView({behavior:"smooth",block:"nearest"});
}

async function ftSaveLog(agentName,formId){
  var date=document.getElementById(formId+"-date").value;
  var by=document.getElementById(formId+"-by").value;
  var notes=document.getElementById(formId+"-notes").value.trim()||null;
  if(!date){alert("Select a date.");return;}
  var btn=document.querySelector("#"+formId+" .ft-save-btn");
  if(btn){btn.disabled=true;btn.textContent="Saving...";}
  try{
    await sbFetch("POST","break_breads",{agent_name:agentName,date:date,logged_by:by,notes:notes});
    var appointmentSyncFailed=false;
    try{
      // Only complete an appointment that has occurred by the logged visit date.
      // An upcoming booked visit is a separate commitment and must remain booked.
      var mk=(window.FT_SCHEDULED_EVENTS||[]).filter(function(e){return String(e.agent_name||"").trim().toUpperCase()===String(agentName||"").trim().toUpperCase()&&e.status==="scheduled"&&String(e.event_date||"")<=date;}).sort(function(a,b){return String(b.event_date||"").localeCompare(String(a.event_date||""));})[0];
      if(mk){
        await sbFetch("PATCH","face_time_events?id=eq."+encodeURIComponent(mk.id),{status:"completed",completed_by:by,notes:notes||mk.notes||null,updated_at:new Date().toISOString()});
        window.FT_SCHEDULED_EVENTS=(window.FT_SCHEDULED_EVENTS||[]).filter(function(e){return String(e.id)!==String(mk.id);});
      }
    }catch(syncErr){appointmentSyncFailed=true;console.warn("Shared Face Time completion sync failed",syncErr);}
    // Update ftData in memory
    var normalizedName=String(agentName||"").trim().toUpperCase();
    if(!ftData[normalizedName]||date>ftData[normalizedName].lastDate){
      ftData[normalizedName]={lastDate:date,source:by,notes:notes||""};
    }
    document.getElementById(formId+"-notes").value="";
    document.getElementById(formId).classList.remove("show");
    renderFaceTime();
    showToast(appointmentSyncFailed?"Visit saved; appointment status could not sync. Please review the booking.":"Visit logged for "+displayName(agentName)+" ✓",appointmentSyncFailed?"error":"success");
  }catch(e){
    showToast("Save failed: "+e.message,"error");
  }finally{
    if(btn){btn.disabled=false;btn.textContent="Save";}
  }
}

function showToast(msg,type){
  var el=document.getElementById("globalToast");
  if(!el){el=document.createElement("div");el.id="globalToast";el.style.cssText="position:fixed;bottom:26px;left:50%;transform:translateX(-50%) translateY(8px);padding:10px 20px;border-radius:10px;font-size:13px;font-weight:500;z-index:9999;opacity:0;transition:all .3s;pointer-events:none;color:#fff;max-width:360px";document.body.appendChild(el);}
  el.style.background=type==="success"?"#0A6B4C":type==="error"?"#8B1F1F":"#1C2B2A";
  el.textContent=msg;el.style.opacity="1";el.style.transform="translateX(-50%) translateY(0)";
  setTimeout(function(){el.style.opacity="0";el.style.transform="translateX(-50%) translateY(8px)";},3000);
}

function fmtDate(d){
  if(!d)return"—";
  return new Date(d+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
}
var coMktPartners=[];
var coMktLeadCounts={};
var coMktLeadKeysByName={};
var coMktClosedCounts={};
var coMktLeadCountsSource="Live Velocify referrals · month-to-date";
function coMktPaceMetrics(spend,leads,asOf){
 var expected=Math.max(0,Number(spend)||0)/250,count=Math.max(0,Number(leads)||0);
 var minimum=expected>0?Math.ceil(expected*0.8-1e-9):0;
 var d=asOf||new Date(),days=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
 var fraction=Math.max(1,Math.min(days,d.getDate()))/days;
 var fullPct=expected>0?Math.round(count/expected*100):null;
 var pacePct=expected>0?Math.round(count/(expected*fraction)*100):null;
 var target=expected*0.8*fraction,met=expected>0&&count>=minimum;
 var status=expected<=0?"Spend not entered":met?"Monthly goal met":count>=target?"On track MTD":pacePct>=50?"Watch MTD pace":"Behind MTD pace";
 var color=expected<=0?"#64748b":met||count>=target?"#2E7D6A":pacePct>=50?"#B87333":"#8B3A3A";
 return {expected:expected,minimum:minimum,fullPct:fullPct,pacePct:pacePct,target:target,met:met,status:status,color:color,remaining:Math.max(0,minimum-count)};
}


function openDirectorView(btn){
  try{if(typeof rmStopPolling==='function')rmStopPolling()}catch(e){}
  try{if(typeof lpStopPolling==='function')lpStopPolling()}catch(e){}
  currentUser="Director";
  document.querySelectorAll(".who-btn").forEach(function(b){b.classList.remove("active");});
  if(btn) btn.classList.add("active");
  document.querySelectorAll(".view").forEach(function(v){v.classList.remove("active");});
  var view=document.getElementById("view-co-marketing");if(view)view.classList.add("active");
  if(typeof loadCoMktPartners==='function')loadCoMktPartners();
}

function loadCoMktPartners(){
  var el=document.getElementById("director-cards");
  el.innerHTML='<div style="text-align:center;padding:30px;color:var(--text-3);font-size:13px">Loading...</div>';
  var now=new Date(),monthStart=now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-01";
  return Promise.all([
    sbFetch("GET","co_marketing_partners?select=*&order=partner_name.asc"),
    sbFetch("GET","velocify_leads?date_added=gte."+monthStart+"&select=referral_partner_name,lead_key&limit=5000")
  ]).then(function(res){
    coMktPartners=res[0]||[];
    var rawLeads=res[1]||[];
    coMktLeadCounts={};coMktLeadKeysByName={};
    coMktLeadCountsSource="Live Velocify referrals · month-to-date · unique lead keys";
    rawLeads.forEach(function(r,i){
      var name=(r.referral_partner_name||"").trim().toUpperCase();if(!name)return;
      var key=String(r.lead_key||"").trim().toUpperCase()||"UNKEYED:"+name+":"+i;
      if(!coMktLeadKeysByName[name])coMktLeadKeysByName[name]=new Set();
      coMktLeadKeysByName[name].add(key);
    });
    Object.keys(coMktLeadKeysByName).forEach(function(name){
      coMktLeadCounts[name]=coMktLeadKeysByName[name].size;
    });
    coMktClosedCounts={};
    agents.forEach(function(a){
      var name=(a[0]||"").trim().toUpperCase();
      if(!name)return;
      coMktClosedCounts[name]=a[8]||0;
    });
    renderDirectorView();
  }).catch(function(){
    el.innerHTML='<div style="text-align:center;padding:30px;color:var(--red);font-size:13px">Could not load — check connection or run the setup SQL</div>';
  });
}

function coMktLeadsForRoster(roster){
  var total=0,closedTotal=0,perAgent=[],teamSeenLeadKeys=new Set();
  (roster||[]).forEach(function(r){
    var names=[r.name];
    if(r.alias)names.push(r.alias);
    var leadKeys=new Set(),closed=0,aliasSeen={};
    // Aliases belong to the same agent; merge unique lead IDs across names.
    names.forEach(function(n){
      var key=String(n||"").trim().toUpperCase();if(!key||aliasSeen[key])return;aliasSeen[key]=true;
      (coMktLeadKeysByName[key]||[]).forEach(function(leadKey){leadKeys.add(leadKey);});
      closed=Math.max(closed,coMktClosedCounts[key]||0);
    });
    var leads=0;leadKeys.forEach(function(key){
      if(!teamSeenLeadKeys.has(key)){teamSeenLeadKeys.add(key);leads++;}
    });
    var spend=parseFloat(r.spend)||0;
    var req=spend>0?Math.ceil(spend/250*0.8-1e-9):0;
    var rawReq=spend/250;
    var pct=rawReq>0?Math.round(leads/rawReq*100):null;
    perAgent.push({name:r.name,alias:r.alias,leads:leads,closed:closed,spend:spend,req:req,pct:pct,billingEnds:r.billing_ends||""});
    total+=leads;closedTotal+=closed;
  });
  return{total:total,closed:closedTotal,perAgent:perAgent};
}

// Minimal RFC4180-ish CSV parser — handles quoted fields with embedded commas (e.g. "De La Riva, Karen")
function parseCsvSimple(text){
  var rows=[],row=[],field="",inQuotes=false;
  for(var i=0;i<text.length;i++){
    var c=text[i];
    if(inQuotes){
      if(c==='"'){
        if(text[i+1]==='"'){field+='"';i++;}
        else inQuotes=false;
      } else field+=c;
    } else {
      if(c==='"')inQuotes=true;
      else if(c===','){row.push(field);field="";}
      else if(c==='\r'){}
      else if(c==='\n'){row.push(field);rows.push(row);row=[];field="";}
      else field+=c;
    }
  }
  if(field.length||row.length){row.push(field);rows.push(row);}
  if(!rows.length)return[];
  var headers=rows[0];
  return rows.slice(1).filter(function(r){return r.length>1||r[0];}).map(function(r){
    var o={};
    headers.forEach(function(h,i){o[h]=r[i]!==undefined?r[i]:"";});
    return o;
  });
}
function csvDateToISO(s){
  if(!s)return null;
  var d=new Date(s);
  if(isNaN(d.getTime()))return null;
  var mm=("0"+(d.getMonth()+1)).slice(-2);
  var dd=("0"+d.getDate()).slice(-2);
  return d.getFullYear()+"-"+mm+"-"+dd;
}
function loadVelocifyLeadsCsv(input){
  var file=input.files[0];if(!file)return;
  var res=document.getElementById("velocify-csv-result");
  if(res){res.textContent="Reading "+file.name+"...";res.style.color="";}
  var readText=typeof file.text==="function"?file.text():new Promise(function(resolve,reject){var reader=new FileReader();reader.onload=function(e){resolve(e.target.result)};reader.onerror=function(){reject(reader.error||new Error("The browser could not read this file."))};reader.readAsText(file)});
  Promise.resolve(readText).then(function(csvText){
    try{
      var rawRows=parseCsvSimple(csvText);
      var dbRows=[],dates=[],skipped=0;
      rawRows.forEach(function(r){
        var name=(r["Referral Partner Name"]||"").trim();
        var buyer=[(r["First Name"]||"").trim(),(r["Last Name"]||"").trim()].filter(Boolean).join(" ");
        var iso=csvDateToISO(r["Date Added"]);
        if((!name&&!buyer)||!iso){skipped++;return;}
        dates.push(iso);
        dbRows.push({
          referral_partner_name:name,
          buyer_name:buyer,
          date_added:iso,
          last_update:csvDateToISO(r["Last Action Date"]),
          last_action_date:csvDateToISO(r["Last Action Date"]),
          lp_user:(r["User"]||"").trim(),
          status:(r["Status"]||"").trim(),
          lead_source:(r["Lead Source"]||"").trim(),
          last_action_note:(r["Last Action Note"]||"").trim()
        });
      });
      if(!dbRows.length){if(res){res.style.color="#E53935";res.textContent="No usable rows found in "+file.name+".";}return;}
      dates.sort();
      var minDate=dates[0],maxDate=dates[dates.length-1];
      var msg="This will DELETE all velocify_leads rows dated "+minDate+" through "+maxDate+", then re-insert the "+dbRows.length+" leads from "+file.name+" ("+skipped+" rows skipped for missing borrower/partner name or date).\n\nThis updates the shared database for everyone, not just this session. Continue?";
      if(!confirm(msg)){if(res){res.textContent="Cancelled.";}input.value="";return;}
      if(res){res.style.color="";res.textContent="Deleting "+minDate+" – "+maxDate+" and inserting "+dbRows.length+" leads...";}
      sbFetch("DELETE","velocify_leads?date_added=gte."+minDate+"&date_added=lte."+maxDate)
        .then(function(){return sbFetch("POST","velocify_leads",dbRows);})
        .then(function(){
          if(res){res.style.color="#43A047";res.textContent="Synced: replaced "+minDate+" – "+maxDate+" with "+dbRows.length+" leads from "+file.name+". Reloading live counts...";}
          coMktLeadCountsSource="Live sync (velocify_leads, year-to-date)";
          return loadCoMktPartners();
        })
        .then(function(){
          if(res){res.style.color="#43A047";res.textContent="Synced "+dbRows.length+" leads to Supabase ("+minDate+" – "+maxDate+"). Live counts below are up to date.";}
        })
        .catch(function(err){
          if(res){res.style.color="#E53935";res.textContent="Sync failed: "+err.message+" — no changes may have been saved, please verify in Supabase before retrying.";}
        });
    }catch(err){
      if(res){res.style.color="#E53935";res.textContent="Error reading CSV: "+err.message;}
    }
  }).catch(function(err){if(res){res.style.color="#E53935";res.textContent="Could not read "+file.name+": "+(err&&err.message||"file read failed");}});
  input.value="";
}

function platTag(p){
  if(p==="zillow")return'<span style="background:#EFF6FF;color:#006AFF;font-size:9px;font-weight:700;padding:2px 8px;border-radius:20px">Zillow</span>';
  if(p==="both")return'<span style="background:#EEF1F6;color:#3D4E68;font-size:9px;font-weight:700;padding:2px 8px;border-radius:20px">Both</span>';
  return'<span style="background:#FFF1F2;color:#D92424;font-size:9px;font-weight:700;padding:2px 8px;border-radius:20px">Realtor.com</span>';
}

function renderDirectorView(){
  var el=document.getElementById("director-cards");
  if(!coMktPartners.length){el.innerHTML='<div style="padding:20px;color:var(--text-3);font-size:13px">No partners yet — run the setup SQL to seed them.</div>';return;}

  // Do not use stale July 2026 annual spend constants. Monthly spend is verified
  // from the latest billing workbook; 12-month spend must be independently sourced.

  coMktPartners.sort(function(a,b){return(a.partner_name||"").localeCompare(b.partner_name||"");});

  // ── Verify lead counts against a fresh Velocify export instead of trusting the live sync blindly ──
  var csvHtml='<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">';
  csvHtml+='<div><div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.04em">Lead count source</div>';
  csvHtml+='<div style="font-size:12px;margin-top:2px">'+escHtml(coMktLeadCountsSource)+'</div>';
  csvHtml+='<div id="velocify-csv-result" style="font-size:11px;margin-top:4px"></div></div>';
  csvHtml+='<div><label style="font-size:11px;border:1px solid var(--border);background:var(--bg);border-radius:6px;padding:6px 12px;cursor:pointer;font-weight:600">Sync Velocify leads CSV to database<input type="file" accept=".csv" style="display:none" onchange="loadVelocifyLeadsCsv(this)"></label></div>';
  csvHtml+='</div>';

  // ── Bulk spend editor — update several partners' verified monthly spend without opening each card ──
  var bulkHtml='<details style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:16px"><summary style="padding:12px 14px;font-weight:700;cursor:pointer">Edit partner spend · expand only when needed</summary>';
  bulkHtml+='<div style="padding:10px 14px;background:var(--bg);border-bottom:1px solid var(--border);font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.04em">Quick spend update — verified monthly numbers, not Power BI estimates</div>';
  bulkHtml+='<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>';
  ["Partner","Platform","Agent Spend","Lender Spend","Zillow Total","Realtor.com Total"].forEach(function(h){
    bulkHtml+='<th style="text-align:left;padding:6px 14px;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;border-bottom:1px solid var(--border-light)">'+h+'</th>';
  });
  bulkHtml+='</tr></thead><tbody>';
  coMktPartners.forEach(function(p){
    bulkHtml+='<tr>';
    bulkHtml+='<td style="padding:6px 14px;border-bottom:1px solid var(--border-light);font-weight:600">'+escHtml(p.partner_name)+'</td>';
    bulkHtml+='<td style="padding:6px 14px;border-bottom:1px solid var(--border-light)">'+platTag(p.platform)+'</td>';
    bulkHtml+='<td style="padding:6px 14px;border-bottom:1px solid var(--border-light)"><input type="number" step="0.01" value="'+(p.agent_spend||0)+'" onchange="dmSaveField('+p.id+',\'agent_spend\',this.value)" style="width:95px;border:1px solid var(--border);border-radius:6px;padding:4px 7px;font-size:12px;font-family:inherit"></td>';
    bulkHtml+='<td style="padding:6px 14px;border-bottom:1px solid var(--border-light)"><input type="number" step="0.01" value="'+(p.your_spend||0)+'" onchange="dmSaveField('+p.id+',\'your_spend\',this.value)" style="width:95px;border:1px solid var(--border);border-radius:6px;padding:4px 7px;font-size:12px;font-family:inherit"></td>';
    var bulkZillowTotal=(p.platform==="both")?((parseFloat(p.agent_spend_zillow)||0)+(parseFloat(p.your_spend_zillow)||0)):(p.platform==="zillow"?((parseFloat(p.agent_spend)||0)+(parseFloat(p.your_spend)||0)):null);
    var bulkRealtorTotal=(p.platform==="both")?((parseFloat(p.agent_spend)||0)+(parseFloat(p.your_spend)||0)):(p.platform!=="zillow"?((parseFloat(p.agent_spend)||0)+(parseFloat(p.your_spend)||0)):null);
    bulkHtml+='<td style="padding:6px 14px;border-bottom:1px solid var(--border-light);font-family:var(--font-mono);color:var(--text-3)">'+(bulkZillowTotal!==null?"$"+bulkZillowTotal.toLocaleString(undefined,{maximumFractionDigits:0}):"—")+'</td>';
    bulkHtml+='<td style="padding:6px 14px;border-bottom:1px solid var(--border-light);font-family:var(--font-mono);color:var(--text-3)">'+(bulkRealtorTotal!==null?"$"+bulkRealtorTotal.toLocaleString(undefined,{maximumFractionDigits:0}):"—")+'</td>';
    bulkHtml+='</tr>';
  });
  bulkHtml+='</tbody></table></details>';

  var html=csvHtml+bulkHtml+'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">';
  var summaryRows=[];

  coMktPartners.forEach(function(p,idx){
    var roster=p.agent_roster||[];
    var lc=coMktLeadsForRoster(roster);
    var combinedYourSpend=(parseFloat(p.your_spend)||0)+(p.platform==="both"?(parseFloat(p.your_spend_zillow)||0):0);
    var pace=coMktPaceMetrics(combinedYourSpend,lc.total);
    var req=pace.minimum;
    var rawReq=pace.expected;
    var pct=pace.pacePct;

    // An annual CTA must never divide one month's spend by twelve months' production.
    var pb_leads=p.pb_leads_12mo||0;
    var pb_closed=p.pb_closed_12mo||0;
    var pb_vol=p.pb_vol_12mo||0;
    var annualSpend=Number(p.spend_12mo);
    var spend12mo=annualSpend>0?annualSpend:null;
    var pb_cta_num=pb_vol>0&&spend12mo!==null?(spend12mo/pb_vol)*100:null;
    var statusLabel=pace.status;
    var goalColor=pace.color;
    var goalBg=pct===null?"#cbd5e1":pace.met||lc.total>=pace.target?"#34D399":pct>=50?"#FBBF24":"#F87171";
    var costPerLead=lc.total>0&&combinedYourSpend?("$"+(combinedYourSpend/lc.total).toFixed(0)):"—";
    var pb_notSynced=!p.pb_synced_at;
    var pb_cta=pb_cta_num!==null?pb_cta_num.toFixed(2)+"%":"—";
    var pb_cta_color=pb_cta_num===null?"var(--text-3)":pb_cta_num<=0.50?"#2E7D6A":pb_cta_num<=1.0?"#B87333":"#E53935";
    var pb_cta_label=pb_cta_num!==null?(pb_cta_num<=0.50?"✅ On target":pb_cta_num<=1.0?"⚠ Watch":"🚨 Above goal"):"Annual spend not verified";

    summaryRows.push({id:idx,name:p.partner_name,platform:p.platform,yourSpend:combinedYourSpend,req:req,rawReq:rawReq,leads:lc.total,closed:lc.closed,pbLeads:pb_leads,pbClosed:pb_closed,pct:pct,color:goalColor,status:statusLabel,cta:pb_cta,ctaColor:pb_cta_color});

    html+='<div id="dmwrap-'+idx+'" style="background:var(--surface);border:1px solid var(--border);border-left:4px solid '+goalBg+';border-radius:10px;overflow:hidden">';
    html+='<div style="padding:12px 14px;border-bottom:1px solid var(--border);cursor:pointer" onclick="dmToggleCard('+idx+')">';
    html+='<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">';
    html+='<div><div style="font-size:14px;font-weight:700">'+escHtml(p.partner_name)+'</div>';
    html+='<div style="font-size:11px;color:var(--text-3)">'+escHtml(p.brokerage||"")+(p.since_date?" · Since "+fmt(p.since_date):"")+'</div><div style="font-size:10px;color:var(--text-3);margin-top:4px">$'+combinedYourSpend.toLocaleString(undefined,{maximumFractionDigits:0})+'/mo · '+rawReq.toFixed(1)+' expected · '+req+' minimum at 80% · '+lc.total+' MTD · '+pace.remaining+' to goal</div></div>';
    html+='<div style="text-align:right">'+platTag(p.platform)+'<div style="font-size:11px;font-weight:700;color:'+goalColor+';margin-top:4px">'+statusLabel+'</div><div style="font-size:11px;font-weight:700;color:'+pb_cta_color+';margin-top:2px">CTA: '+pb_cta+'</div></div>';
    html+='</div></div>';

    html+='<div id="dmcard-'+idx+'" style="display:none;padding:12px 14px">';
    html+='<div style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;margin-bottom:4px">Spend breakdown'+(p.platform==="both"?' <span style="text-transform:none;font-weight:400">(Realtor.com side)</span>':'')+'</div>';
    html+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">';
    var cardTotalVal=(parseFloat(p.agent_spend)||0)+(parseFloat(p.your_spend)||0);
    html+='<div><label style="font-size:9px;color:var(--text-3);text-transform:uppercase;font-weight:700">Agent spend</label>';
    html+='<input type="number" step="0.01" value="'+(p.agent_spend||0)+'" onchange="dmSaveField('+p.id+',\'agent_spend\',this.value)" style="width:100%;border:1px solid var(--border);border-radius:6px;padding:5px 8px;font-size:12px;font-family:inherit"></div>';
    html+='<div><label style="font-size:9px;color:var(--text-3);text-transform:uppercase;font-weight:700">Lender spend</label>';
    html+='<input type="number" step="0.01" value="'+(p.your_spend||0)+'" onchange="dmSaveField('+p.id+',\'your_spend\',this.value)" style="width:100%;border:1px solid var(--border);border-radius:6px;padding:5px 8px;font-size:12px;font-family:inherit"></div>';
    html+='<div style="grid-column:span 2"><label style="font-size:9px;color:var(--text-3);text-transform:uppercase;font-weight:700">12mo expenditure ($) <span style="text-transform:none;font-weight:400;color:#1F4E79">— enter from Power BI "12 Months Expenditure" tile — used for Cost to Acquire</span></label>';
    html+='<input type="number" step="0.01" value="'+(p.spend_12mo||0)+'" onchange="dmSaveField('+p.id+',\'spend_12mo\',this.value)" style="width:100%;border:1px solid #BFD4E8;border-radius:6px;padding:5px 8px;font-size:12px;font-family:inherit;background:#F0F6FF"></div>';
    html+='</div>';
    if(p.platform==="both"){
      var zillowTotal=(parseFloat(p.agent_spend_zillow)||0)+(parseFloat(p.your_spend_zillow)||0);
      var realtorTotal=cardTotalVal;
      html+='<div style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;margin-bottom:4px">Spend breakdown <span style="text-transform:none;font-weight:400">(Zillow side)</span></div>';
      html+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">';
      html+='<div><label style="font-size:9px;color:var(--text-3);text-transform:uppercase;font-weight:700">Agent spend</label>';
      html+='<input type="number" step="0.01" value="'+(p.agent_spend_zillow||0)+'" onchange="dmSaveField('+p.id+',\'agent_spend_zillow\',this.value)" style="width:100%;border:1px solid var(--border);border-radius:6px;padding:5px 8px;font-size:12px;font-family:inherit"></div>';
      html+='<div><label style="font-size:9px;color:var(--text-3);text-transform:uppercase;font-weight:700">Lender spend</label>';
      html+='<input type="number" step="0.01" value="'+(p.your_spend_zillow||0)+'" onchange="dmSaveField('+p.id+',\'your_spend_zillow\',this.value)" style="width:100%;border:1px solid var(--border);border-radius:6px;padding:5px 8px;font-size:12px;font-family:inherit"></div>';
      html+='</div>';
      html+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">';
      html+='<div style="background:var(--surface-2);border-radius:6px;padding:8px 10px;display:flex;justify-content:space-between;align-items:center"><span style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase">Realtor.com total</span><span style="font-size:14px;font-weight:800;font-family:var(--font-mono)">$'+realtorTotal.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})+'</span></div>';
      html+='<div style="background:var(--surface-2);border-radius:6px;padding:8px 10px;display:flex;justify-content:space-between;align-items:center"><span style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase">Zillow total</span><span style="font-size:14px;font-weight:800;font-family:var(--font-mono)">$'+zillowTotal.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})+'</span></div>';
      html+='</div>';
    }

    // ── Power BI synced metrics ──
    var pb_synced=p.pb_synced_at?"Last Power BI sync: "+p.pb_synced_at:"Not yet synced — upload Power BI export in Admin";
    var cleanDate=function(d){return(!d||d==="1970-01-01"||d.indexOf("1970")==0)?(p.pb_synced_at?"No closes yet":"—"):d;};
    var pb12Goal=(combinedYourSpend/250)*12;
    var pb12Pct=pb12Goal>0?Math.round(pb_leads/pb12Goal*100):0;
    var pb12Color=pb12Pct>=80?"#2E7D6A":pb12Pct>=50?"#B87333":"#8B3A3A";

    html+='<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--border);border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:6px">';
    html+='<div style="background:var(--surface-2);padding:8px;text-align:center"><div style="font-size:9px;color:var(--text-3);text-transform:uppercase">MTD Leads</div><div style="font-size:18px;font-weight:800">'+lc.total+'</div><div style="font-size:9px;color:'+goalColor+'">'+(pace.fullPct===null?"—":pace.fullPct+"%")+' of full-month target</div></div>';
    html+='<div style="background:var(--surface-2);padding:8px;text-align:center"><div style="font-size:9px;color:var(--text-3);text-transform:uppercase">12mo Leads</div><div style="font-size:18px;font-weight:800">'+pb_leads+'</div><div style="font-size:9px;color:'+pb12Color+'">'+pb12Pct+'% of 12mo goal</div></div>';
    html+='<div style="background:var(--surface-2);padding:8px;text-align:center"><div style="font-size:9px;color:var(--text-3);text-transform:uppercase">12mo Closings</div><div style="font-size:18px;font-weight:800;color:#2E7D6A">'+pb_closed+'</div></div>';
    html+='<div style="background:var(--surface-2);padding:8px;text-align:center"><div style="font-size:9px;color:var(--text-3);text-transform:uppercase">12mo Volume</div><div style="font-size:13px;font-weight:800">'+(pb_vol>0?"$"+(pb_vol/1000000).toFixed(2)+"M":"—")+'</div></div>';
    html+='<div style="background:var(--surface-2);padding:8px;text-align:center"><div style="font-size:9px;color:var(--text-3);text-transform:uppercase">Cost to Acquire</div><div style="font-size:18px;font-weight:800;color:'+pb_cta_color+'">'+pb_cta+'</div><div style="font-size:9px;font-weight:600;color:'+pb_cta_color+'">'+pb_cta_label+'</div></div>';
    html+='</div>';

    html+='<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:6px">';
    html+='<div style="background:var(--surface-2);border-radius:6px;padding:6px 8px"><div style="font-size:9px;color:var(--text-3);text-transform:uppercase">Latest lead</div><div style="font-size:12px;font-weight:600">'+cleanDate(p.pb_latest_lead)+'</div></div>';
    html+='<div style="background:var(--surface-2);border-radius:6px;padding:6px 8px"><div style="font-size:9px;color:var(--text-3);text-transform:uppercase">Latest contract</div><div style="font-size:12px;font-weight:600">'+cleanDate(p.pb_latest_contract)+'</div></div>';
    html+='<div style="background:var(--surface-2);border-radius:6px;padding:6px 8px"><div style="font-size:9px;color:var(--text-3);text-transform:uppercase">Latest close</div><div style="font-size:12px;font-weight:600">'+cleanDate(p.pb_latest_close)+'</div></div>';
    html+='</div>';
    html+='<div style="font-size:9px;color:var(--text-3);margin-bottom:10px;font-style:italic">'+pb_synced+'</div>';

    html+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">';
    html+='<span style="font-size:10px;color:var(--text-3);white-space:nowrap">$250 rule (need '+req+' MTD)</span>';
    html+='<div style="flex:1;background:#EAEAEA;border-radius:20px;height:5px;overflow:hidden"><div style="height:5px;border-radius:20px;width:'+Math.min(100,pct)+'%;background:'+goalBg+'"></div></div>';
    html+='<span style="font-size:11px;font-weight:800;color:'+goalColor+'">'+lc.total+' leads</span>';
    html+='</div>';

    html+='<div style="font-size:11px;font-weight:700;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">Agent roster &amp; optional spend allocation';
    html+='<span style="display:flex;gap:6px">';
    html+='<button onclick="dmAddAgent('+idx+')" style="font-size:10px;border:1px solid var(--border);background:var(--bg);border-radius:6px;padding:2px 8px;cursor:pointer">+ Add agent</button>';
    html+='</span></div>';
    html+='<div style="font-size:10px;color:var(--text-3);padding-bottom:7px">Partner billing totals above are authoritative. Blank allocations do not mean $0 spent.</div>';
    html+='<div style="display:flex;gap:6px;padding:2px 0 4px;font-size:9px;color:var(--text-3);text-transform:uppercase;font-weight:700"><span style="flex:1">Agent</span><span style="width:90px">Alias</span><span style="width:78px;text-align:right">Allocated $</span><span style="min-width:44px;text-align:right">Leads</span><span style="min-width:44px;text-align:right">Closed</span><span style="width:14px"></span></div>';
    html+='<div id="dmroster-'+idx+'">';
    lc.perAgent.forEach(function(a,ai){
      html+='<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border-light)">';
      html+='<input value="'+escHtml(a.name)+'" onchange="dmRosterField('+idx+','+ai+',\'name\',this.value)" style="flex:1;border:1px solid var(--border);border-radius:6px;padding:3px 7px;font-size:11px">';
      html+='<input value="'+escHtml(a.alias||"")+'" placeholder="alias" onchange="dmRosterField('+idx+','+ai+',\'alias\',this.value)" style="width:90px;border:1px solid var(--border);border-radius:6px;padding:3px 7px;font-size:10px;color:var(--text-3)">';
      html+='<input type="number" step="1" value="'+(a.spend>0?a.spend:"")+'" placeholder="—" onchange="dmRosterField('+idx+','+ai+',\'spend\',this.value)" style="width:78px;border:1px solid var(--border);border-radius:6px;padding:3px 7px;font-size:10px;text-align:right">';
      html+='<span style="font-size:10px;color:var(--text-3);font-family:var(--font-mono);min-width:44px;text-align:right">'+a.leads+'</span>';
      html+='<span style="font-size:10px;color:#2E7D6A;font-family:var(--font-mono);font-weight:700;min-width:44px;text-align:right">'+a.closed+'</span>';
      html+='<button onclick="dmRemoveAgent('+idx+','+ai+')" style="font-size:11px;color:var(--red);border:none;background:none;cursor:pointer">✕</button>';
      html+='</div>';
    });
    html+='</div>';

    html+='<textarea placeholder="Add note..." onchange="dmSaveField('+p.id+',\'note\',this.value)" style="width:100%;margin-top:10px;border:1px solid var(--border);border-radius:6px;padding:6px 8px;font-size:11px;font-family:inherit;min-height:40px">'+escHtml(p.note||"")+'</textarea>';
    html+='</div></div>';
  });
  html+='</div>';

  var totalYourSpend=summaryRows.reduce(function(s,r){return s+r.yourSpend;},0);
  var totalLeads=summaryRows.reduce(function(s,r){return s+r.leads;},0);
  var totalClosed12=summaryRows.reduce(function(s,r){return s+Number(r.pbClosed||0);},0);
  var totalReq=summaryRows.reduce(function(s,r){return s+r.req;},0);
  var totalRawReq=summaryRows.reduce(function(s,r){return s+r.rawReq;},0);
  var overallPace=coMktPaceMetrics(totalYourSpend,totalLeads);
  var overallPct=overallPace.pacePct===null?"—":overallPace.pacePct;
  var overallColor=overallPace.color;
  var concernCount=summaryRows.filter(function(r){return r.pct!==null&&r.pct<50;}).length;
  var watchCount=summaryRows.filter(function(r){return r.pct!==null&&r.pct>=50&&r.pct<80;}).length;

  html+='<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px 18px">';
  html+='<div style="font-size:13px;font-weight:700;margin-bottom:4px">Platform Performance</div>';
  html+='<div style="font-size:11px;color:var(--text-3);margin-bottom:12px">MTD pace adjusts for days elapsed: $250 lender spend = 1 expected lead per month; 80% is the full-month minimum (rounded up). Annual cost to acquire and funded closings are separate. Only verified Velocify buyer leads are counted automatically.</div>';
  html+='<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px">';
  html+='<div style="background:var(--surface-2);border-radius:8px;padding:10px;text-align:center"><div style="font-size:9px;color:var(--text-3);text-transform:uppercase">Total spend</div><div style="font-size:18px;font-weight:800">$'+totalYourSpend.toLocaleString(undefined,{maximumFractionDigits:0})+'</div></div>';
  html+='<div style="background:var(--surface-2);border-radius:8px;padding:10px;text-align:center"><div style="font-size:9px;color:var(--text-3);text-transform:uppercase">MTD referred leads</div><div style="font-size:18px;font-weight:800">'+totalLeads+'</div></div>';
  html+='<div style="background:var(--surface-2);border-radius:8px;padding:10px;text-align:center"><div style="font-size:9px;color:var(--text-3);text-transform:uppercase">12mo closings</div><div style="font-size:18px;font-weight:800">'+totalClosed12+'</div></div>';
  html+='<div style="background:var(--surface-2);border-radius:8px;padding:10px;text-align:center"><div style="font-size:9px;color:var(--text-3);text-transform:uppercase">80% goal · leads</div><div style="font-size:18px;font-weight:800">'+totalReq+'</div></div>';
  html+='<div style="background:var(--surface-2);border-radius:8px;padding:10px;text-align:center"><div style="font-size:9px;color:var(--text-3);text-transform:uppercase">MTD pace</div><div style="font-size:18px;font-weight:800;color:'+overallColor+'">'+overallPct+'%</div></div>';
  html+='</div>';

  html+='<table style="width:100%;border-collapse:collapse;font-size:12px">';
  html+='<thead><tr>';
  ["Partner","Platform","NFM spend/mo","80% goal/mo","MTD leads","12mo closes","Annual CTA","MTD status"].forEach(function(h){
    html+='<th style="background:var(--bg);padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;border-bottom:1px solid var(--border)">'+h+'</th>';
  });
  html+='</tr></thead><tbody>';
  summaryRows.sort(function(a,b){return a.pct-b.pct;}).forEach(function(r){
    html+='<tr style="cursor:pointer" onclick="dmScrollTo('+r.id+')" onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'\'">';
    html+='<td style="padding:9px 10px;border-bottom:1px solid var(--border);font-weight:600">'+escHtml(r.name)+'</td>';
    html+='<td style="padding:9px 10px;border-bottom:1px solid var(--border)">'+platTag(r.platform)+'</td>';
    html+='<td style="padding:9px 10px;border-bottom:1px solid var(--border);font-family:var(--font-mono)">$'+r.yourSpend.toLocaleString(undefined,{maximumFractionDigits:0})+'</td>';
    html+='<td style="padding:9px 10px;border-bottom:1px solid var(--border);font-family:var(--font-mono)">'+r.req+'</td>';
    html+='<td style="padding:9px 10px;border-bottom:1px solid var(--border);font-family:var(--font-mono);color:'+r.color+'">'+r.leads+'</td>';
    html+='<td style="padding:9px 10px;border-bottom:1px solid var(--border);font-family:var(--font-mono);font-weight:800">'+Number(r.pbClosed||0)+'</td>';
    html+='<td style="padding:9px 10px;border-bottom:1px solid var(--border);font-weight:700;color:'+(r.ctaColor||"var(--text-3)")+'">'+( r.cta||"—")+'</td>';
    html+='<td style="padding:9px 10px;border-bottom:1px solid var(--border);color:'+r.color+';font-weight:600">'+r.status+'</td>';
    html+='</tr>';
  });
  html+='</tbody></table></div>';
  el.innerHTML=html;
}

function dmToggleCard(idx){
  var c=document.getElementById("dmcard-"+idx);
  if(c)c.style.display=c.style.display==="none"?"block":"none";
}
function dmSaveField(id,field,val){
  var payload={};
  payload[field]=(field.indexOf("spend")>=0||field==="total_cost"||field==="lender_budget"||field==="agent_spend"||field==="closed_vol_12mo"||field==="pb_leads_12mo"||field==="pb_closed_12mo"||field==="pb_vol_12mo")?parseFloat(val)||0:val;
  sbFetch("PATCH","co_marketing_partners?id=eq."+id,payload).then(function(){
    var p=coMktPartners.find(function(x){return x.id===id;});
    if(p)p[field]=payload[field];
    renderDirectorView();
  }).catch(function(){alert("Save failed — try again");});
}
function dmRosterField(idx,agentIdx,field,val){
  var p=coMktPartners[idx];
  if(!p.agent_roster[agentIdx])return;
  p.agent_roster[agentIdx][field]=field==="spend"?(parseFloat(val)||0):val;
  sbFetch("PATCH","co_marketing_partners?id=eq."+p.id,{agent_roster:p.agent_roster}).then(function(){renderDirectorView();}).catch(function(){});
}
function dmAddAgent(idx){
  var p=coMktPartners[idx];
  p.agent_roster.push({name:"New agent",alias:"",spend:0});
  sbFetch("PATCH","co_marketing_partners?id=eq."+p.id,{agent_roster:p.agent_roster}).then(function(){renderDirectorView();}).catch(function(){});
}
// One-click loader for the latest per-agent Zillow monthly spend (from the Zillow billing dashboard screenshot).
// Matches each name against every partner's existing roster first (an agent's spend can live under
// a team partner like "Sam Cooper Team" or a paired partner like "Kristina Murphy + Nancy Price") —
// only creates a brand-new partner row when the agent isn't found anywhere.
var ZILLOW_SPEND_LATEST={
  "BRANDON THOMPSON":2000,
  "KRISTINA MURPHY":1000,
  "KISHMA JAMES":620
};
function dmRemoveAgent(idx,agentIdx){
  var p=coMktPartners[idx];
  p.agent_roster.splice(agentIdx,1);
  sbFetch("PATCH","co_marketing_partners?id=eq."+p.id,{agent_roster:p.agent_roster}).then(function(){renderDirectorView();}).catch(function(){});
}
function dmScrollTo(idx){
  var wrap=document.getElementById("dmwrap-"+idx);
  var card=document.getElementById("dmcard-"+idx);
  if(!wrap)return;
  card.style.display="block";
  wrap.scrollIntoView({behavior:"smooth",block:"center"});
  wrap.style.boxShadow="0 0 0 3px #4A7C6F";
  setTimeout(function(){wrap.style.boxShadow="";},1300);
}  

/* ══════════════════════════════════════════════════════════
   CORE TEAM TRACKER — ADDITIVE ENHANCEMENT BUNDLE
   Everything below is new. Nothing above this point was
   rewritten — only two confirmed-dead duplicate/orphaned
   blocks were removed (see chat for what and why).
   ══════════════════════════════════════════════════════════ */
(function(){

/* ── 1. AESTHETIC PASS — refined type, color, spacing ── */
var ctStyle=document.createElement("style");
ctStyle.textContent=`
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
.app{font-family:'Geist','Inter',-apple-system,sans-serif !important;}
.brand-logo{letter-spacing:.1em !important;}
.call-card{
  border-radius:14px !important;
  box-shadow:0 1px 3px rgba(26,26,46,.05),0 1px 2px rgba(26,26,46,.03) !important;
  transition:box-shadow .15s ease, transform .1s ease !important;
}
.call-card:hover{box-shadow:0 4px 14px rgba(26,26,46,.08),0 2px 6px rgba(26,26,46,.04) !important;}
.call-card.priority{background:linear-gradient(180deg,#fff8f8 0%,#fffbfb 100%) !important;}
.check-btn{transition:transform .12s ease, background .15s ease !important;}
.check-btn:active{transform:scale(0.92) !important;}
.outcome-btn{border-radius:10px !important; transition:all .12s ease !important;}
.outcome-btn:active{transform:scale(0.96) !important;}
.badge{border-radius:6px !important; letter-spacing:.04em !important;}
.lp-tag{border-radius:6px !important;}
.who-btn{border-radius:24px !important; transition:all .15s ease !important;}
.who-btn.active{box-shadow:0 2px 8px rgba(0,0,0,.08) !important;}
.note-field{border-radius:10px !important; font-family:'Geist','Inter',sans-serif !important;}
.btn-primary{border-radius:10px !important; font-weight:700 !important; letter-spacing:.01em !important;
  transition:transform .1s ease, box-shadow .15s ease !important;}
.btn-primary:active{transform:scale(0.98) !important;}
.d-card,.scorecard,.leaderboard-row,.search-panel,.admin-section{
  border-radius:14px !important;
  box-shadow:0 1px 3px rgba(26,26,46,.05) !important;
}
.lp-hero{border-radius:16px !important; box-shadow:0 8px 24px -8px rgba(26,26,46,.25) !important;}
::-webkit-scrollbar{height:6px;width:6px;}
::-webkit-scrollbar-thumb{background:#d0d5dd;border-radius:10px;}
`;
document.head.appendChild(ctStyle);

/* Mobile safety net for elements this bundle added — the app.css already
   has a 600px breakpoint for existing UI, this just covers what's new */
var ctMobileStyle=document.createElement("style");
ctMobileStyle.textContent=`
@media(max-width:600px){
  #ct-overdue-queue{padding:12px 14px !important;}
  #ct-overdue-queue > div{font-size:12px !important;}
  .ct-quick-save{font-size:11px !important;}
}
`;
document.head.appendChild(ctMobileStyle);

/* ── 2. DRAFT PERSISTENCE — survive refresh / app switch ── */
var CT_DRAFT_KEY="ct_pending_notes_backup";
try{
  var savedDrafts=localStorage.getItem(CT_DRAFT_KEY);
  if(savedDrafts && typeof pendingNote==="object"){
    var parsed=JSON.parse(savedDrafts);
    Object.keys(parsed).forEach(function(k){ if(!pendingNote[k]) pendingNote[k]=parsed[k]; });
  }
}catch(e){}

function ctPersistDrafts(){
  try{ localStorage.setItem(CT_DRAFT_KEY, JSON.stringify(pendingNote)); }catch(e){}
}
function ctClearDraft(name){
  try{
    var d=JSON.parse(localStorage.getItem(CT_DRAFT_KEY)||"{}");
    delete d[name];
    localStorage.setItem(CT_DRAFT_KEY, JSON.stringify(d));
  }catch(e){}
}

// Wrap (not replace the body of) each function that touches pendingNote,
// so drafts get backed up automatically without editing their source.
["queueNote","selectPendingOutcome","togglePendingRmFlag","toggleCallFromCard"].forEach(function(fnName){
  if(typeof window[fnName]==="function"){
    var orig=window[fnName];
    window[fnName]=function(){
      var result=orig.apply(this,arguments);
      ctPersistDrafts();
      return result;
    };
  }
});
if(typeof window.tryConfirmCall==="function"){
  var origTryConfirm=window.tryConfirmCall;
  window.tryConfirmCall=function(name,lp){
    var before=!!pendingNote[name];
    var result=origTryConfirm.apply(this,arguments);
    // if the pending note was cleared (save succeeded), drop its backup too
    if(before && !pendingNote[name]) ctClearDraft(name);
    return result;
  };
}

/* ── 3. QUICK-SAVE for VM / Text outcomes — skip the note requirement ── */
// No-answer outreach uses a guided VM + follow-up-text flow. Adds a small "Quick save"
// button next to the existing Save button once VM or Text is selected —
// it calls your existing upsertCallLogWithOutcome directly, unmodified.
function ctInjectQuickSave(card,name,lp,outcome){ return; }

document.addEventListener("click",function(e){
  var btn=e.target.closest(".outcome-btn");
  if(!btn) return;
  var name=btn.getAttribute("data-name"), lp=btn.getAttribute("data-lp"), outc=btn.getAttribute("data-outcome");
  if(!name||!outc) return;
  setTimeout(function(){
    var scope=btn.parentElement ? btn.parentElement.parentElement : document;
    ctInjectQuickSave(scope, name, lp, outc);
  }, 30);
}, true);

/* ── 4. "CALL MY NEXT AGENT" — one tap to jump to the top of the list ── */
function callNextAgent(){
  if(!currentUser || typeof getRotation!=="function") return;
  var rot=getRotation(currentUser).filter(function(a){ return !calledThisWeek(a[0]); });
  if(!rot.length){
    alert("You completed this week’s call list.");
    return;
  }
  var name=rot[0][0];
  pendingNote[name]={draft:"",outcome:""};
  ctPersistDrafts();
  renderLP(currentUser);
  setTimeout(function(){
    var field=document.querySelector('.note-field[data-name="'+name+'"]');
    var card=field ? field.closest(".call-card") : null;
    if(card){ card.scrollIntoView({behavior:"smooth",block:"center"}); }
    if(field) field.focus();
  },150);
}
window.callNextAgent=callNextAgent;

function ctInjectCallNextButton(){
  var list=document.getElementById("lp-call-list");
  if(!list || document.getElementById("ct-call-next-btn")) return;
  var btn=document.createElement("button");
  btn.id="ct-call-next-btn";
  btn.className="btn btn-primary";
  btn.style.cssText="width:100%;padding:13px;margin-bottom:.75rem;border-radius:10px;font-size:14px";
  btn.textContent="📞 Call my next agent";
  btn.onclick=callNextAgent;
  list.parentElement.insertBefore(btn,list);
}
if(typeof window.renderLP==="function"){
  var origRenderLP=window.renderLP;
  window.renderLP=function(lp){
    var result=origRenderLP.apply(this,arguments);
    ctInjectCallNextButton();
    return result;
  };
}

/* ── 5. RUNNING WEEKLY TOTAL TOAST on save ── */
function ctShowToast(msg){
  var el=document.getElementById("ctToast");
  if(!el){
    el=document.createElement("div");
    el.id="ctToast";
    el.style.cssText="position:fixed;bottom:26px;left:50%;transform:translateX(-50%) translateY(8px);"
      +"background:#1F4E79;color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;"
      +"z-index:9999;opacity:0;transition:all .25s;pointer-events:none;box-shadow:0 6px 18px rgba(0,0,0,.18)";
    document.body.appendChild(el);
  }
  el.textContent=msg;
  el.style.opacity="1";
  el.style.transform="translateX(-50%) translateY(0)";
  clearTimeout(el._t);
  el._t=setTimeout(function(){
    el.style.opacity="0";
    el.style.transform="translateX(-50%) translateY(8px)";
  },2600);
}
if(typeof window.upsertCallLogWithOutcome==="function"){
  var origUpsertOutcome=window.upsertCallLogWithOutcome;
  window.upsertCallLogWithOutcome=function(name,lp,note,outcome,flagRm){
    var result=origUpsertOutcome.apply(this,arguments);
    if(result && result.then){
      result.then(function(){
        if(typeof getLpCallsThisWeek==="function" && lp){
          var count=getLpCallsThisWeek(lp);
          ctShowToast("✓ Logged "+name+" — now "+count+"/"+(typeof WEEKLY_TARGET!=="undefined"?WEEKLY_TARGET:15)+" this week");
        }
      });
    }
    return result;
  };
}

})();

/* ── No-response handoff: LP → RM team ──
   Creates a real lp_flags handoff (the RM Tracker inbox reads this table)
   and marks the current weekly call record as flagged for compatibility. */
async function ctEscalateNoReply(name,lp){
  name=String(name||"").trim(); lp=String(lp||currentUser||"").trim();
  if(!name||!lp)return;
  var log=callLogs[name]||{};
  var note="No response after LP outreach this week. Left voicemail and sent the required follow-up text. Please review the relationship and advise the next RM/LP move.";
  try{
    var existing=await sbFetch("GET","lp_flags?resolved=eq.false&agent_name=eq."+encodeURIComponent(name)+"&lp=eq."+encodeURIComponent(lp)+"&select=id&limit=1").catch(function(){return[];});
    if(!existing||!existing.length){await sbFetch("POST","lp_flags",{agent_name:name,lp:lp,note:note});}
    lpOpenRmFlags[assignmentKey(name)]={agent_name:name,lp:lp,note:note};
    ctShowToast("Sent to RM team for next step ✓");
    if(typeof renderLP==="function"&&currentUser&&currentUser!=="Snapshot")renderLP(currentUser);
    if(typeof buildSnapshot==="function")buildSnapshot();
    if(typeof ctLoadNotifications==="function")ctLoadNotifications();
  }catch(e){console.error("No-response RM handoff failed",e);ctShowToast("Could not send to RM — try again");}
}
window.ctEscalateNoReply=ctEscalateNoReply;

/* ══════════════════════════════════════════════════════════
   ROUND 2 — anti-copy-paste notes + overdue queue on Snapshot
   Still additive only: wraps tryConfirmCall and buildSnapshot,
   does not edit their source.
   ══════════════════════════════════════════════════════════ */
(function(){

/* ── Note-similarity check (word-overlap, ignores stop words) ── */
var CT_STOPWORDS={"the":1,"to":1,"a":1,"an":1,"and":1,"or":1,"but":1,"in":1,"on":1,"at":1,"for":1,"of":1,
  "with":1,"that":1,"this":1,"is":1,"are":1,"was":1,"were":1,"be":1,"been":1,"have":1,"has":1,"had":1,
  "do":1,"does":1,"did":1,"will":1,"would":1,"could":1,"should":1,"may":1,"can":1,"not":1,"no":1,"it":1,
  "its":1,"they":1,"them":1,"their":1,"we":1,"he":1,"she":1,"his":1,"her":1,"i":1,"you":1,"so":1,"up":1,
  "out":1,"as":1,"by":1,"from":1,"about":1,"if":1,"me":1,"my":1,"us":1,"our":1};
function ctWords(s){
  return (s||"").toLowerCase().replace(/[.,!?;:\-"'()]+/g," ").split(/\s+/)
    .filter(function(w){return w.length>1 && !CT_STOPWORDS[w];});
}
function ctSimilarity(a,b){
  var wa=ctWords(a), wb=ctWords(b);
  if(!wa.length||!wb.length) return 0;
  var setB={}; wb.forEach(function(w){setB[w]=true;});
  var overlap=0; wa.forEach(function(w){if(setB[w])overlap++;});
  return overlap/Math.min(wa.length,wb.length);
}
// Checks this LP's OTHER notes logged this week for a near-duplicate, and
// (separately) this agent's own last note for a stale copy-paste repeat.
function ctFindDuplicate(name,lp,text){
  if(ctWords(text).length<3) return null;
  var thisWeekNotes=Object.values(callLogs).filter(function(l){
    return l.lp===lp && l.week_key===weekKey && l.agent_name!==name && l.note;
  });
  for(var i=0;i<thisWeekNotes.length;i++){
    if(ctSimilarity(text,thisWeekNotes[i].note)>0.6){
      return "This looks nearly identical to your note for "+thisWeekNotes[i].agent_name+".";
    }
  }
  if(typeof prevNotes!=="undefined" && prevNotes[name] && prevNotes[name].note){
    if(ctSimilarity(text,prevNotes[name].note)>0.75){
      return "This matches what you wrote for "+name+" last time — what's different about this call?";
    }
  }
  return null;
}
// "Answered"/"In Person" should reflect what the AGENT said back, not just
// what the LP told them — light heuristic, not a hard block, just a nudge.
var CT_RESPONSE_WORDS=["said","says","mentioned","asked","told me","replied","responded","wants","needs","interested","thinks","feels","agreed","confirmed"];
function ctLacksAgentResponse(text){
  var low=(text||"").toLowerCase();
  return !CT_RESPONSE_WORDS.some(function(w){return low.indexOf(w)>=0;});
}
// Catches "what what what what" style gaming. There is no word-count minimum,
// but obvious repeated filler still is not accepted as a useful note.
// This is a hard block, no override, since there's no legitimate reason
// a genuine note repeats itself like that.
function ctIsRepetitive(text){
  var words=ctWords(text);
  if(words.length<4) return false;
  var freq={}; words.forEach(function(w){freq[w]=(freq[w]||0)+1;});
  var uniqueCount=Object.keys(freq).length;
  var maxRepeat=Math.max.apply(null,Object.values(freq));
  return (uniqueCount/words.length < 0.5) || (maxRepeat/words.length > 0.4);
}

/* Single-save note flow: no word-count minimum.
   We only hard-block blank notes, the required VM+text workflow, or obviously repetitive/gamed text. */
if(typeof window.tryConfirmCall==="function"){
  var origTryConfirm2=window.tryConfirmCall;
  window.tryConfirmCall=function(name,lp){
    var pending=pendingNote[name]||{};
    var draft=(pending.draft||"").trim();
    var outcome=pending.outcome||"";
    var findSaveBtn=function(){
      return document.querySelector('.btn-primary[onclick*="tryConfirmCall"][onclick*="'+name.replace(/'/g,"\\'")+'"]');
    };
    if(outcome && draft && ctIsRepetitive(draft)){
      var btn0=findSaveBtn();
      if(btn0){
        var orig0=btn0.innerHTML;
        btn0.innerHTML="Add a real note about what happened before saving.";
        btn0.style.background="#B54B42";
        btn0.style.fontSize="11px";
        setTimeout(function(){ if(btn0.innerHTML.indexOf("real note")>=0){btn0.innerHTML=orig0;btn0.style.background="";btn0.style.fontSize="";} },3500);
      }
      return;
    }
    // Soft quality checks remain informational only; they no longer block the first save.
    // This keeps the LP workflow to one Save click while preserving the data-quality guardrail above.
    return origTryConfirm2.apply(this,arguments);
  };
}

/* ── Overdue-call queue on Snapshot — team-wide, read only ── */
// Jumps from Snapshot's team-wide queue straight to that agent's card on
// their LP's own tab, with the log-call flow already open — same pattern
// the carryover quick-log already uses.
function ctJumpToAgentAndLog(name, lp){
  var btn=null;
  document.querySelectorAll(".who-btn").forEach(function(b){ if(b.textContent.trim()===lp) btn=b; });
  selectUser(btn, lp);
  pendingNote[name]={draft:"",outcome:""};
  setTimeout(function(){
    renderLP(lp);
    setTimeout(function(){
      var ta=document.querySelector('.note-field[data-name="'+name+'"]');
      if(ta){ ta.scrollIntoView({behavior:"smooth",block:"center"}); ta.focus(); }
      else {
        // Not in the top-15 rotation shown — fall back to search
        var search=document.getElementById("lp-search-input");
        if(search){ search.value=name; renderLpSearch();
          setTimeout(function(){
            var ta2=document.querySelector('#lp-search-results .note-field[data-name="'+name+'"]');
            if(ta2){ ta2.scrollIntoView({behavior:"smooth",block:"center"}); }
          },150);
        }
      }
    },150);
  },200);
}
function ctInjectOverdueQueue(){
  // v37: Team-wide live-connection priority radar intentionally removed from the LP Tracker.
  // Each LP should work only from their own focused weekly list. Cross-team prioritization
  // belongs in the RM/Management workflow so the LP Snapshot stays simple and actionable.
  var old=document.getElementById("ct-overdue-queue");
  if(old) old.remove();
}

// v37: no team-wide live-connection priority injection on LP Snapshot.

})();

/* ══════════════════════════════════════════════════════════
   ROUND 3 — standardized birthday input (structured MM-DD,
   not free text) so the birthday-detection logic always works
   regardless of who enters it or how.
   ══════════════════════════════════════════════════════════ */
(function(){
  var dayEl = document.getElementById("lp-cm-birthday-day");
  if(dayEl){
    for(var d=1; d<=31; d++){
      var opt=document.createElement("option");
      opt.value=String(d).padStart(2,"0");
      opt.textContent=d;
      dayEl.appendChild(opt);
    }
  }
})();
function ctSetBirthdayDropdowns(value){
  var mEl=document.getElementById("lp-cm-birthday-month"), dEl=document.getElementById("lp-cm-birthday-day");
  if(!mEl||!dEl) return;
  mEl.value=""; dEl.value="";
  if(!value) return;
  // HOTFIX: MM/DD is now the shared standard (matches the RM Tracker, which validates and
  // writes MM/DD) — check it first. MM-DD stays supported for reading records this app wrote
  // before this fix; that path is unchanged.
  var slash=value.match(/^(\d{1,2})\/(\d{1,2})$/);
  if(slash){ mEl.value=slash[1].padStart(2,"0"); dEl.value=slash[2].padStart(2,"0"); return; }
  var structured=value.match(/^(\d{2})-(\d{2})$/);
  if(structured){ mEl.value=structured[1]; dEl.value=structured[2]; return; }
  // Legacy free-text value already saved — best-effort parse so it still displays
  var months=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  var parts=value.toLowerCase().trim().split(/[\s\/\-]+/);
  parts.forEach(function(p){
    var mi=months.indexOf(p.substring(0,3));
    if(mi>=0) mEl.value=String(mi+1).padStart(2,"0");
    var n=parseInt(p);
    if(!isNaN(n)&&n>=1&&n<=31) dEl.value=String(n).padStart(2,"0");
  });
}
function ctGetBirthdayValue(){
  var m=document.getElementById("lp-cm-birthday-month"), d=document.getElementById("lp-cm-birthday-day");
  if(!m||!d||!m.value||!d.value) return null;
  // HOTFIX: shared column with the RM Tracker, which requires MM/DD — was MM-DD, which the RM
  // Tracker's save validation rejects, blocking her from saving *any* edit to a contact whose
  // birthday was last set here. Standardized to MM/DD.
  return m.value+"/"+d.value;
}

/* ══════════════════════════════════════════════════════════
   ROUND 4 — Per-LP lead conversion boxes + milestone/stall
   computation. Entirely derived from data already loaded via
   loadReferralLeadsDirect — no new tables needed for this part.
   ══════════════════════════════════════════════════════════ */

// Real status strings from Velocify, mapped to a milestone position.
// Extend this list if your CRM uses additional status values.
var CT_MILESTONE_ORDER=["New","Contact Attempt","Contacted","Nurture","Converted to App"];
function ctMapStatusToStage(status){
  var s=(status||"").toLowerCase();
  if(ctIsLeadAppConverted(status)) return 4;
  if(s.indexOf("nurture")>=0) return 3;
  if(s.indexOf("contact attempt")>=0) return 1;
  if(s==="contacted") return 2;
  return 0;
}
// A lead is "stalled" if it hasn't moved in 5+ days and is not already
// converted/resolved — separate signal from agent staleness.
function ctIsLeadStalled(r){
  var s=(r.status||"").toLowerCase();
  if(ctInitialOutreachComplete(r)||ctIsLeadResolved(r)||s.indexOf("nurture")>=0||s.indexOf("scheduled")>=0) return false;
  var lu=r.last_action_date||r.last_update||r.date_added;
  if(!lu) return true;
  var days=Math.floor((new Date()-new Date(lu+"T00:00:00"))/86400000);
  return days>=5;
}

function ctRenderLpConversionBoxes(data){
  var host=document.getElementById("lp-conversion-boxes-v2");
  if(!host||!data) return;
  var lpMap={"Gavin":["Dill","Gavin"],"Karen":["De La Riva","Karen"],"Osgood":["McMahon","Osgood"],"Jordan":["Johnston","Jordan"],"Said":["Saleh","Said"],"Isaak":["Caldwell","Isaak"]};
  var order=["Gavin","Karen","Osgood","Jordan","Said","Isaak","Other / Core Team"];
  var now=new Date(),todayStr=localDateStr(now),stats={};
  order.forEach(function(lp){stats[lp]={today:0,sent:0,started:0};});
  function bucket(r){
    var u=(r.lp_user||"");
    for(var lp in lpMap){if(lpMap[lp].some(function(k){return u.indexOf(k)>=0;}))return lp;}
    return "Other / Core Team";
  }
  data.forEach(function(r){
    var lp=bucket(r),s=stats[lp];s.sent++;
    if(r.date_added===todayStr)s.today++;
    if(ctIsLeadAppConverted(r))s.started++;
  });
  var teamSent=data.length,teamStarted=data.filter(function(r){return ctIsLeadAppConverted(r);}).length;
  var teamAvg=teamSent?Math.round(teamStarted/teamSent*100):0;
  var html='<div style="font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--text-3);margin-bottom:8px">Per-user conversion — MTD</div>';
  html+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">';
  order.forEach(function(lp){
    var s=stats[lp],ltf=s.sent?Math.round(s.started/s.sent*100):0;
    if(lp==="Other / Core Team"&&!s.sent)return;
    var color=ltf>=teamAvg?"#3E8E5A":ltf>0?"#B8842B":"#94a3b8";
    html+='<div style="background:#fff;border:1px solid var(--border);border-top:3px solid #3D4E68;border-radius:10px;padding:12px 14px">'
      +'<div style="font-size:13px;font-weight:700;color:#3D4E68;margin-bottom:6px">'+lp+'</div>'
      +'<div style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0"><span style="color:var(--text-3)">Today</span><span style="font-weight:700">'+s.today+' sent</span></div>'
      +'<div style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0"><span style="color:var(--text-3)">Leads sent MTD</span><span style="font-weight:700">'+s.sent+'</span></div>'
      +'<div style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0"><span style="color:var(--text-3)">Converted to app</span><span style="font-weight:700">'+s.started+'</span></div>'
      +'<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border);display:flex;justify-content:space-between"><span style="font-size:10.5px;color:var(--text-3)">Lead → App</span><span style="font-size:16px;font-weight:800;color:'+color+'">'+ltf+'%</span></div>'
      +'</div>';
  });
  html+='</div>';
  host.innerHTML=html;
}

if(typeof window.renderReferralLeadsDirect==="function"){
  var origRenderRefLeads=window.renderReferralLeadsDirect;
  window.renderReferralLeadsDirect=function(data){
    var result=origRenderRefLeads.apply(this,arguments);
    ctRenderLpConversionBoxes(data);
    return result;
  };
}

/* ══════════════════════════════════════════════════════════
   ROUND 5 — lead_notes + lp_flags integration. Requires the
   two tables from tracker-new-tables.sql to exist in Supabase
   before these actually save anywhere.
   ══════════════════════════════════════════════════════════ */
(function(){

/* ── Buyer-update drawer (reminder checklist + note + personal touch) ── */
function ctBuyerDrawerHtml(rowId,agentName,buyerName,lp,isStalled){
  var stallOptions=["Still working it","Unresponsive buyer","Went with another lender","Bad contact info","Buyer paused search"];
  var html='<div id="drawer-'+rowId+'" style="display:none;padding:12px 16px;background:#FAFAF9;border-top:1px dashed var(--border)">';
  html+='<div style="font-size:10.5px;color:var(--text-3);background:var(--accent-dim);border-radius:7px;padding:8px 10px;margin-bottom:8px;line-height:1.6">';
  html+='<b>Cover before you save:</b> where they are · timeline · docs outstanding · rate discussed · concerns · red flags · next step · best way to reach them';
  html+='</div>';
  if(isStalled){
    html+='<div style="margin-bottom:8px"><label style="font-size:11px;font-weight:700;color:#B54B42">⚠ Stuck in this stage — why?</label>';
    html+='<select id="stall-'+rowId+'" style="width:100%;margin-top:4px;border:1px solid var(--border);border-radius:7px;padding:6px 8px;font-size:12px;font-family:inherit">';
    stallOptions.forEach(function(o){html+='<option>'+o+'</option>';});
    html+='</select></div>';
  }
  html+='<textarea id="note-'+rowId+'" placeholder="Log this buyer update..." style="width:100%;border:1px solid var(--border);border-radius:8px;padding:9px;font-size:12.5px;font-family:inherit;min-height:60px;resize:vertical;box-sizing:border-box"></textarea>';
  html+='<div style="margin-top:8px;background:#FBF3F8;border:1px solid #E4CBDD;border-radius:8px;padding:10px 12px">';
  html+='<div style="font-size:11px;font-weight:700;color:#9D5B8C;margin-bottom:4px">🐾 Something personal you noticed? (optional)</div>';
  html+='<input type="text" id="personal-'+rowId+'" placeholder="e.g. dog barking in the background..." style="width:100%;border:1px solid #E4CBDD;border-radius:7px;padding:7px 9px;font-size:12px;font-family:inherit;box-sizing:border-box">';
  html+='<label style="display:flex;align-items:center;gap:6px;margin-top:6px;font-size:11px;color:#9D5B8C;cursor:pointer"><input type="checkbox" id="gesture-'+rowId+'" style="cursor:pointer"> Let '+(typeof RM_NAME!=="undefined"?RM_NAME:"the RM")+' know — might be worth a small thank-you gesture</label>';
  html+='</div>';
  html+='<button onclick="ctSaveBuyerNote(\''+rowId+'\',\''+agentName+'\',\''+buyerName+'\',\''+lp+'\')" style="margin-top:8px;width:100%;padding:8px;border-radius:8px;background:var(--accent);color:#fff;border:none;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit">Save update</button>';
  html+='<div id="saved-'+rowId+'" style="display:none;margin-top:6px;font-size:11px;color:#15803d;font-weight:700">✓ Saved</div>';
  html+='</div>';
  return html;
}
window.ctBuyerDrawerHtml=ctBuyerDrawerHtml;

function ctToggleLeadDrawer(rowId){
  var d=document.getElementById('drawer-'+rowId);
  if(d) d.style.display = d.style.display==='none' ? 'block' : 'none';
}
window.ctToggleLeadDrawer=ctToggleLeadDrawer;

function ctSaveBuyerNote(rowId,agentName,buyerName,lp){
  var noteEl=document.getElementById('note-'+rowId);
  var personalEl=document.getElementById('personal-'+rowId);
  var gestureEl=document.getElementById('gesture-'+rowId);
  var stallEl=document.getElementById('stall-'+rowId);
  var payload={
    lead_agent_name: agentName,
    lead_buyer_name: buyerName || null,
    lp: lp,
    note: noteEl ? noteEl.value.trim() || null : null,
    stall_reason: stallEl ? stallEl.value : null,
    personal_detail: personalEl ? personalEl.value.trim() || null : null,
    notify_rm_gesture: gestureEl ? gestureEl.checked : false,
    created_by: lp
  };
  sbFetch("POST","lead_notes",payload).then(function(){
    var saved=document.getElementById('saved-'+rowId);
    if(saved) saved.style.display='block';
    ctShowToast("✓ Buyer update saved");
  }).catch(function(e){
    ctShowToast("Save failed — check that lead_notes table exists");
    console.error("lead_notes save failed:",e);
  });
}
window.ctSaveBuyerNote=ctSaveBuyerNote;

/* ── Standalone flags for RM (lp_flags table) ── */
function ctSubmitFlag(agentName,note,lp){
  if(!note || !note.trim()){ ctShowToast("Add a note before flagging"); return; }
  sbFetch("POST","lp_flags",{agent_name:agentName||null,lp:lp,note:note.trim()}).then(function(){
    ctShowToast("Flag sent to RM");
  }).catch(function(e){
    ctShowToast("Flag failed — check that lp_flags table exists");
    console.error("lp_flags save failed:",e);
  });
}
window.ctSubmitFlag=ctSubmitFlag;

// Inject a general "Flag for RM" button + form above the search panel on each LP view
function ctInjectGeneralFlagButton(){
  var searchPanel=document.querySelector("#view-lp .search-panel");
  if(!searchPanel || document.getElementById("ct-general-flag-btn")) return;
  var wrap=document.createElement("div");
  wrap.innerHTML='<button id="ct-general-flag-btn" style="width:100%;padding:10px;margin-bottom:12px;border-radius:10px;background:#FBF3E5;color:#B8842B;border:1px solid #B8842B;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">🚩 Flag something for RM — not tied to a call</button>'
    +'<div id="ct-general-flag-form" style="display:none;background:#fff;border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:12px">'
    +'<input type="text" id="ct-flag-agent" placeholder="Agent name (optional)" style="width:100%;border:1px solid var(--border);border-radius:7px;padding:8px 10px;font-size:13px;font-family:inherit;box-sizing:border-box;margin-bottom:8px">'
    +'<textarea id="ct-flag-note" placeholder="What does the RM need to know?" style="width:100%;border:1px solid var(--border);border-radius:7px;padding:8px 10px;font-size:13px;font-family:inherit;min-height:60px;resize:vertical;box-sizing:border-box"></textarea>'
    +'<button id="ct-flag-send" style="width:100%;margin-top:8px;padding:9px;border-radius:8px;background:var(--accent);color:#fff;border:none;font-weight:700;font-size:12.5px;cursor:pointer;font-family:inherit">Send flag</button>'
    +'</div>';
  searchPanel.parentElement.insertBefore(wrap, searchPanel);
  document.getElementById("ct-general-flag-btn").onclick=function(){
    var f=document.getElementById("ct-general-flag-form");
    f.style.display = f.style.display==='none' ? 'block' : 'none';
  };
  document.getElementById("ct-flag-send").onclick=function(){
    var agent=document.getElementById("ct-flag-agent").value.trim();
    var note=document.getElementById("ct-flag-note").value;
    ctSubmitFlag(agent||null, note, currentUser);
    document.getElementById("ct-flag-agent").value="";
    document.getElementById("ct-flag-note").value="";
    document.getElementById("ct-general-flag-form").style.display="none";
  };
}
if(typeof window.renderLP==="function"){
  var origRenderLP2=window.renderLP;
  window.renderLP=function(lp){
    var result=origRenderLP2.apply(this,arguments);
    ctInjectGeneralFlagButton();
    return result;
  };
}

/* ── RM view: Gesture opportunities + LP flags panels ── */
function ctLoadGestureOpportunities(){
  var host=document.getElementById("ct-gesture-panel");
  if(!host) return;
  sbFetch("GET","lead_notes?notify_rm_gesture=eq.true&gesture_sent=eq.false&select=*&order=created_at.desc&limit=20").then(function(rows){
    if(!rows || !rows.length){ host.innerHTML=""; return; }
    var html='<div style="font-size:11px;font-weight:700;color:#9D5B8C;text-transform:uppercase;margin:16px 0 8px">🎁 Gesture opportunities</div>';
    html+='<div style="background:#FBF3F8;border:1px solid #E4CBDD;border-radius:10px;padding:4px 16px">';
    rows.forEach(function(r){
      html+='<div style="padding:10px 0;border-bottom:1px solid #E4CBDD">';
      html+='<div style="font-size:13px;font-weight:700;color:#0f172a">'+escHtml(r.lead_buyer_name||r.lead_agent_name)+'<span style="font-weight:400;color:#9D5B8C;font-size:11px"> via '+escHtml(r.lp)+'</span></div>';
      html+='<div style="font-size:12px;color:#5b3a52;margin-top:2px">🐾 '+escHtml(r.personal_detail||"")+'</div>';
      html+='<button onclick="ctMarkGestureSent(\''+r.id+'\')" style="margin-top:4px;font-size:10.5px;font-weight:700;color:#9D5B8C;background:none;border:none;cursor:pointer;font-family:inherit">Mark gesture sent</button>';
      html+='</div>';
    });
    html+='</div>';
    host.innerHTML=html;
  }).catch(function(){ host.innerHTML=""; });
}
window.ctMarkGestureSent=function(id){
  sbFetch("PATCH","lead_notes?id=eq."+id,{gesture_sent:true}).then(function(){
    ctShowToast("Marked as sent");
    ctLoadGestureOpportunities();
  }).catch(function(){ ctShowToast("Update failed"); });
};

function ctLoadLpFlags(){
  var host=document.getElementById("ct-lpflags-panel");
  if(!host) return;
  sbFetch("GET","lp_flags?resolved=eq.false&select=*&order=created_at.desc&limit=20").then(function(rows){
    if(!rows || !rows.length){ host.innerHTML=""; return; }
    var html='<div style="font-size:11px;font-weight:700;color:#B8842B;text-transform:uppercase;margin:16px 0 8px">🚩 Flagged by LPs</div>';
    html+='<div style="background:#FBF3E5;border:1px solid #E8DDC8;border-radius:10px;padding:4px 16px">';
    rows.forEach(function(r){
      html+='<div style="padding:10px 0;border-bottom:1px solid #E8DDC8">';
      html+='<div style="font-size:13px;font-weight:700;color:#0f172a">'+(r.agent_name?escHtml(displayName(r.agent_name)):"General")+'<span style="font-weight:400;color:#8C7355;font-size:11px"> via '+escHtml(r.lp)+'</span></div>';
      html+='<div style="font-size:12px;color:#5C4A35;margin-top:2px;font-style:italic">"'+escHtml((r.note||"").substring(0,140))+'"</div>';
      html+='<div style="display:flex;gap:10px;margin-top:4px">';
      html+='<button onclick="ctAssignFlag(\''+r.id+'\')" style="font-size:10.5px;font-weight:700;color:var(--accent);background:none;border:none;cursor:pointer;font-family:inherit">Assign to me</button>';
      html+='<button onclick="ctResolveFlag(\''+r.id+'\')" style="font-size:10.5px;font-weight:700;color:#15803d;background:none;border:none;cursor:pointer;font-family:inherit">Mark handled</button>';
      html+=(r.assigned_to?'<span style="font-size:10px;color:#8C7355;margin-left:auto">assigned: '+escHtml(r.assigned_to)+'</span>':'');
      html+='</div></div>';
    });
    html+='</div>';
    host.innerHTML=html;
  }).catch(function(){ host.innerHTML=""; });
}
window.ctAssignFlag=function(id){
  sbFetch("PATCH","lp_flags?id=eq."+id,{assigned_to:"Amanda"}).then(function(){ ctShowToast("Assigned to you"); ctLoadLpFlags(); }).catch(function(){});
};
window.ctResolveFlag=function(id){
  sbFetch("PATCH","lp_flags?id=eq."+id,{resolved:true,resolved_at:new Date().toISOString()}).then(function(){ ctShowToast("Marked handled"); ctLoadLpFlags(); }).catch(function(){});
};


if(typeof window.openRmView==="function"){
  var origOpenRmView=window.openRmView;
  window.openRmView=function(btn){
    var result=origOpenRmView.apply(this,arguments);
    setTimeout(ctInjectRmPanels, 200);
    return result;
  };
}

})();

/* ══════════════════════════════════════════════════════════
   ROUND 6 — real week-over-week trend, backed by an actual
   weekly_metrics_snapshot table (see tracker-metrics-table.sql).
   Auto-captures once per week on first Snapshot view, so 90 days
   from now there's real history to show, not a live-only number.
   ══════════════════════════════════════════════════════════ */
(function(){

function ctComputeWeeklyMetrics(){
  // Duplicate notes flagged this week — retroactively checks each LP's
  // notes against each other using the same similarity logic as the
  // live duplicate-check, since flagged events aren't stored individually.
  var dupCount=0;
  LPS.forEach(function(lp){
    var notes=Object.values(callLogs).filter(function(l){return l.lp===lp&&l.week_key===weekKey&&l.note;});
    for(var i=0;i<notes.length;i++){
      for(var j=i+1;j<notes.length;j++){
        if(ctSimilarity(notes[i].note,notes[j].note)>0.6){ dupCount++; break; }
      }
    }
  });

  // Stale contacts — active agents 14+ days since last touch
  var staleCount=agents.filter(function(a){
    if(!isActive(a)) return false;
    var d=effectiveDays(a);
    return d!==null && d>=14;
  }).length;

  // RM-flagged — resolved=false rows in lp_flags, plus legacy flag_rm on call_logs
  var flagRmCount=Object.values(callLogs).filter(function(l){return l.flag_rm;}).length;

  // Team avg talk-to completion %
  var pcts=LPS.map(function(lp){ return getLpPctThisWeek(lp); });
  var avgTalkTo=Math.round(pcts.reduce(function(a,b){return a+b;},0)/pcts.length);

  // Lead-to-app % from the corrected raw pipeline data already loaded
  var ltf=0;
  if(window.leadPipelineData && window.leadPipelineData.totals && window.leadPipelineData.totals.mtd>0){
    ltf=Math.round(window.leadPipelineData.totals.file_starts_mtd/window.leadPipelineData.totals.mtd*100);
  }

  return {duplicate_notes_flagged:dupCount, stale_contacts:staleCount, rm_flagged_count:flagRmCount, team_avg_talkto_pct:avgTalkTo, lead_to_file_pct:ltf};
}

var ctSnapshotCapturedThisSession=false;
function ctCaptureWeeklySnapshotIfNeeded(){
  if(ctSnapshotCapturedThisSession) return;
  ctSnapshotCapturedThisSession=true;
  sbFetch("GET","weekly_metrics_snapshot?week_key=eq."+weekKey+"&select=id").then(function(rows){
    if(rows && rows.length) return; // already captured this week
    var m=ctComputeWeeklyMetrics();
    m.week_key=weekKey;
    return sbFetch("POST","weekly_metrics_snapshot",m);
  }).catch(function(e){ console.warn("weekly snapshot capture skipped:",e); });
}

function ctRenderTrendPanel(){
  var host=document.getElementById("d-snapshot-body");
  if(!host) return;
  var old=document.getElementById("ct-trend-panel");
  if(old) old.remove();

  sbFetch("GET","weekly_metrics_snapshot?select=*&order=week_key.desc&limit=13").then(function(rows){
    if(!rows || rows.length<2) return; // need at least 2 weeks of real history to show a trend
    var current=ctComputeWeeklyMetrics();
    var prior=rows[0]; // most recent captured week (last week, since this week captures on first visit)

    var metrics=[
      {key:"duplicate_notes_flagged",label:"Duplicate notes flagged",lowerIsBetter:true},
      {key:"stale_contacts",label:"Stale contacts (14d+)",lowerIsBetter:true},
      {key:"rm_flagged_count",label:"Flagged by RM",lowerIsBetter:true},
      {key:"team_avg_talkto_pct",label:"Team avg talk-to rate",lowerIsBetter:false,suffix:"%"},
      {key:"lead_to_file_pct",label:"Lead-to-app rate",lowerIsBetter:false,suffix:"%"}
    ];

    var box=document.createElement("div");
    box.id="ct-trend-panel";
    box.style.cssText="background:#fff;border:1px solid #E4E6EA;border-radius:12px;padding:14px 18px;margin-bottom:18px;";
    var cellsHtml=metrics.map(function(m){
      var curVal=current[m.key], priorVal=prior[m.key]||0;
      var diff=curVal-priorVal;
      var improving = m.lowerIsBetter ? diff<0 : diff>0;
      var trendHtml = diff===0 ? '<span style="color:#94a3b8">— no change</span>'
        : '<span style="color:'+(improving?'#3E8E5A':'#B54B42')+';font-weight:700">'+(diff>0?'▲':'▼')+Math.abs(diff)+(m.suffix||'')+' vs last captured week</span>';
      return '<div style="flex:1;min-width:140px"><div style="font-size:20px;font-weight:800;color:var(--text)">'+curVal+(m.suffix||'')+'</div>'
        +'<div style="font-size:10.5px;color:#6B7280;font-weight:600;margin-bottom:2px">'+m.label+'</div>'
        +'<div style="font-size:10.5px">'+trendHtml+'</div></div>';
    }).join('');
    box.innerHTML='<div style="font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#6B7280;margin-bottom:10px">Trend vs. last captured week <span style="font-weight:600;text-transform:none;color:#94a3b8">· '+rows.length+' week'+(rows.length!==1?'s':'')+' of history</span></div>'
      +'<div style="display:flex;gap:16px;flex-wrap:wrap">'+cellsHtml+'</div>';
    host.insertBefore(box, host.firstChild);
  }).catch(function(e){ console.warn("trend panel load failed:",e); });
}

if(typeof window.buildSnapshot==="function"){
  var origBuildSnapshot2=window.buildSnapshot;
  window.buildSnapshot=function(){
    var result=origBuildSnapshot2.apply(this,arguments);
    ctCaptureWeeklySnapshotIfNeeded();
    setTimeout(ctRenderTrendPanel, 400);
    return result;
  };
}

})();

/* ══════════════════════════════════════════════════════════
   ROUND 7 — monthly lead goal (100/month) with pace projection,
   shown right next to MTD Leads on the Leads tab.
   ══════════════════════════════════════════════════════════ */
(function(){

function ctRenderLeadGoalPace(){
  var el=document.getElementById("ref-mtd-goal-pace");
  var valEl=document.getElementById("ref-mtd-leads-v2");
  if(!el || !valEl) return;
  var mtd=parseInt(valEl.textContent, 10);
  if(isNaN(mtd)) return;

  var d=window.ctV72MonthlyDetail||{};
  var activeAgents=Number(d.activeAgentCount||(d.meta&&d.meta.total)||0);
  var goal=Math.max(100,Math.ceil(activeAgents*1.15));
  var now=new Date();
  var daysInMonth=new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  var dayOfMonth=now.getDate();
  var projected=Math.round((mtd/dayOfMonth)*daysInMonth);
  var onTrack = projected >= goal;
  var color = onTrack ? "#3E8E5A" : "#B8842B";
  var goalText=activeAgents
    ? 'RM target: '+goal+'/mo ('+activeAgents+' active agents × 1.15; 100 minimum)'
    : 'RM minimum: 100/mo · dynamic target updates when Power BI roster loads';

  el.innerHTML = goalText+' · <span style="color:'+color+';font-weight:700">projecting '+projected+'</span>'
    + (onTrack ? ' ✓ on track' : ' — pace it up');
}

if(typeof window.renderReferralLeadsDirect==="function"){
  var origRenderRefLeads2=window.renderReferralLeadsDirect;
  window.renderReferralLeadsDirect=function(data){
    var result=origRenderRefLeads2.apply(this,arguments);
    setTimeout(ctRenderLeadGoalPace, 30);
    return result;
  };
}

})();

/* ══════════════════════════════════════════════════════════
   ROUND 8 — real notification bell, pulling from lp_flags and
   lead_notes (gesture opportunities). Plus per-agent "Flag for
   RM" button on individual call cards, using the same lp_flags
   table the general flag button already writes to.
   ══════════════════════════════════════════════════════════ */
(function(){

function ctLoadNotifications(){
  var badge=document.getElementById("ct-notif-badge"),list=document.getElementById("ct-notif-list");
  if(!badge||!list)return;
  var isLp=["Gavin","Karen","Osgood","Jordan","Said","Isaak"].indexOf(currentUser)>=0;
  var lpFilter=isLp?"&lp=eq."+encodeURIComponent(currentUser):"";
  var openLpFlags="lp_flags?resolved=eq.false"+lpFilter+"&select=*&order=created_at.desc&limit=5";
  var rmToLpPath="rm_lp_flags?resolved=eq.false"+lpFilter+"&select=*&order=created_at.desc&limit=5";
  var directReplies=isLp?"lp_flags?lp=eq."+encodeURIComponent(currentUser)+"&rm_note=not.is.null&select=id,agent_name,lp,rm_note,rm_note_at,rm_note_by,resolved,created_at&order=rm_note_at.desc&limit=10":null;
  var callReplies=isLp?"call_logs?lp=eq."+encodeURIComponent(currentUser)+"&rm_note=not.is.null&select=id,agent_name,lp,rm_note,rm_note_at,flag_rm,call_date&order=rm_note_at.desc&limit=10":null;
  Promise.all([
    sbFetch("GET",openLpFlags).catch(function(){return[];}),
    sbFetch("GET","lead_notes?notify_rm_gesture=eq.true&gesture_sent=eq.false&select=lead_buyer_name,lead_agent_name,lp,created_at&order=created_at.desc&limit=5").catch(function(){return[];}),
    sbFetch("GET",rmToLpPath).catch(function(){return[];}),
    directReplies?sbFetch("GET",directReplies).catch(function(){return[]}):Promise.resolve([]),
    callReplies?sbFetch("GET",callReplies).catch(function(){return[]}):Promise.resolve([])
  ]).then(function(results){
    var flags=results[0]||[],gestures=results[1]||[],rmFlags=results[2]||[];
    var responseRows=(results[3]||[]).map(function(r){return{source:"direct",id:r.id,agent_name:r.agent_name||"",rm_note:r.rm_note||"",rm_note_at:r.rm_note_at||r.created_at||"",rm_note_by:r.rm_note_by||"RM"};})
      .concat((results[4]||[]).map(function(r){return{source:"call",id:r.id,agent_name:r.agent_name||"",rm_note:r.rm_note||"",rm_note_at:r.rm_note_at||r.call_date||"",rm_note_by:"RM"};}));
    var seen={};responseRows=responseRows.filter(function(r){var k=r.source+"|"+r.id+"|"+r.rm_note_at+"|"+r.rm_note;if(seen[k])return false;seen[k]=1;return !ctRmHiddenRow(r)&&!!String(r.rm_note||"").trim();});
    responseRows.sort(function(a,b){return String(b.rm_note_at||"").localeCompare(String(a.rm_note_at||""));});
    var unreadResponses=isLp?responseRows.filter(function(r){return !ctRmResponseIsRead(currentUser,r)}).slice(0,5):[];
    var total=flags.length+gestures.length+rmFlags.length+unreadResponses.length;
    if(total>0){badge.textContent=total>9?"9+":total;badge.style.display="flex";}else badge.style.display="none";
    if(total===0){list.innerHTML='<div style="padding:8px 0;color:var(--text-3)">Nothing new right now</div>';return;}
    var html="";
    unreadResponses.forEach(function(r){
      html+='<button type="button" onclick="ctOpenRmResponses('+JSON.stringify(currentUser)+')" style="display:block;width:100%;text-align:left;padding:8px 7px;border:0;border-bottom:1px solid var(--border-light);background:#FFF7F7;cursor:pointer;font:inherit">'
        +'<div style="font-weight:850;color:#A12727">💬 NEW RM RESPONSE · '+escHtml(r.agent_name?displayName(r.agent_name):"General")+'</div>'
        +'<div style="color:#526575;font-size:11px;margin-top:2px">'+escHtml(r.rm_note_by||"RM")+' — “'+escHtml(String(r.rm_note||"").substring(0,95))+'”</div>'
        +'<div style="color:#007FA4;font-size:10px;font-weight:800;margin-top:3px">Open response — alert stays until cleared →</div></button>';
    });
    flags.forEach(function(f){
      html+='<div style="padding:7px 0;border-bottom:1px solid var(--border-light)"><div style="font-weight:700;color:var(--text)">🚩 '+(f.agent_name?escHtml(displayName(f.agent_name)):"General flag")+'</div><div style="color:var(--text-2);font-size:11px">via '+escHtml(f.lp||"")+' — “'+escHtml((f.note||"").substring(0,60))+'”</div>'+(f.rm_note?'<div style="margin-top:5px;padding:5px 7px;background:#ecfdf5;border-radius:6px;color:#166534;font-size:11px"><strong>RM reply'+(f.rm_note_by?' · '+escHtml(f.rm_note_by):'')+':</strong> '+escHtml(String(f.rm_note).substring(0,120))+'</div>':'')+'</div>';
    });
    rmFlags.forEach(function(f){html+='<div style="padding:7px 0;border-bottom:1px solid var(--border-light);background:#FFFDF7"><div style="font-weight:700;color:#6F4E00">📥 RM → '+escHtml(f.lp||"LP")+' · '+escHtml(f.agent_name?displayName(f.agent_name):"General")+'</div><div style="color:#6C6252;font-size:11px">from '+escHtml(f.created_by||"RM")+' — “'+escHtml(String(f.note||"").substring(0,80))+'”</div></div>';});
    gestures.forEach(function(g){html+='<div style="padding:7px 0;border-bottom:1px solid var(--border-light)"><div style="font-weight:700;color:var(--text)">🎁 '+escHtml(g.lead_buyer_name||g.lead_agent_name)+'</div><div style="color:var(--text-2);font-size:11px">via '+escHtml(g.lp||"")+' — gesture opportunity</div></div>';});
    list.innerHTML=html;
  }).catch(function(){list.innerHTML='<div style="color:var(--text-3)">Could not load</div>';});
}
window.ctLoadNotifications=ctLoadNotifications;

var notifBell=document.getElementById("ct-notif-bell");
if(notifBell){
  notifBell.addEventListener("click", function(){
    var panel=document.getElementById("ct-notif-panel");
    var isOpen=panel.style.display!=="none";
    panel.style.display = isOpen ? "none" : "block";
    if(!isOpen) ctLoadNotifications();
  });
}
setInterval(ctLoadNotifications, 60000);
setTimeout(ctLoadNotifications, 2000);

/* ── Per-agent "Flag for RM" button on individual call cards ── */
function ctInjectPerAgentFlagButtons(){
  document.querySelectorAll(".call-card, .search-agent-row").forEach(function(card){
    if(card.querySelector(".ct-agent-flag-btn")) return;
    var checkBtn=card.querySelector(".check-btn[data-name]");
    if(!checkBtn) return;
    var name=checkBtn.getAttribute("data-name");
    var lp=checkBtn.getAttribute("data-lp")||currentUser;
    var btn=document.createElement("button");
    btn.className="ct-agent-flag-btn";
    btn.style.cssText="margin-top:6px;font-size:10.5px;font-weight:700;color:#B8842B;background:none;border:none;cursor:pointer;font-family:inherit;padding:0";
    btn.textContent="🚩 Flag for RM";
    btn.onclick=function(e){
      e.stopPropagation();
      var note=prompt("What does the RM need to know about "+name+"?");
      if(note) ctSubmitFlag(name, note, lp);
    };
    var infoDiv=card.querySelector(".call-info") || card;
    infoDiv.appendChild(btn);
  });
}
if(typeof window.renderLP==="function"){
  var origRenderLP3=window.renderLP;
  window.renderLP=function(lp){
    var result=origRenderLP3.apply(this,arguments);
    setTimeout(ctInjectPerAgentFlagButtons, 100);
    return result;
  };
}
if(typeof window.renderLpSearch==="function"){
  var origRenderLpSearch=window.renderLpSearch;
  window.renderLpSearch=function(){
    var result=origRenderLpSearch.apply(this,arguments);
    setTimeout(ctInjectPerAgentFlagButtons, 100);
    return result;
  };
}

})();

/* ══════════════════════════════════════════════════════════
   ROUND 9 — Monthly Portfolio Review. Read-only display of the
   operating standard's review metrics (Active Partner Count, Tier Migration,
   Active Agent-to-Lead Ratio, Partner Health, Growth Opportunity
   coverage). Pulls from agent_profiles / tier_migrations /
   amanda_activities — the same tables Amanda's own tracker writes
   to — plus velocify_leads directly for a real (not manually-
   logged) lead count. No new tables, no new input forms: this tab
   only reads.
   ══════════════════════════════════════════════════════════ */
(function(){

var PFR_TIER_TOUCH={Channel:14,A:14,B:30,C:60};
var PFR_TIER_URGENT={Channel:21,A:21,B:45,C:90};
var pfrPeriod="week";
var pfrDrill={};

function pfrTierLabel(tier){return tier?tier+"-tier":"No tier set";}

function pfrHealthScore(daysSinceLead,daysAny,threshold,urgent,competitorRisk){
  if(competitorRisk)return"Red";
  // Operating Standard Health lead-recency bands are flat: 30d = Yellow, 60d = Red.
  // Meaningful-contact cadence remains tier-based as a separate signal.
  if(daysSinceLead===null||daysSinceLead>=60)return"Red";
  if(daysAny===null||daysAny>=urgent)return"Red";
  if(daysSinceLead>=30)return"Yellow";
  if(daysAny>=threshold)return"Yellow";
  return"Green";
}

function pfrPeriodRange(){
  var now=new Date();
  if(pfrPeriod==="week"){
    var wk=getWeekKey(now);
    var end=new Date(wk+"T12:00:00");end.setDate(end.getDate()+6);
    return{start:wk,end:localDateStr(end),label:"This Week"};
  }
  var d2=new Date(now.getFullYear(),now.getMonth(),1);
  var d3=new Date(now.getFullYear(),now.getMonth()+1,0);
  return{start:localDateStr(d2),end:localDateStr(d3),label:"This Month"};
}

// Syncs agent_profiles from the Power BI upload so Portfolio Review, Health Score, cadence
// checks, and tier badges all reflect the latest data from a single LP Tracker upload.
// Mirrors the RM Tracker's Contacts Bulk Import logic exactly — same table, same fields.
async function lpSyncAgentProfilesFromUpload(rows){
  if(!rows||!rows.length)return;
  // HOTFIX (shared Power BI logic pass): this used to batch-upsert with every row's tier/email/
  // phone set unconditionally — including explicit nulls for blank cells, which overwrote good
  // existing manually-maintained data on every re-import — and wrote Title-Cased names straight
  // from the ALL-CAPS export, which could create a second row for someone like "McMahon"
  // (mangled to "Mcmahon") instead of matching their real existing record. This version:
  //  - looks up existing agents first (case-insensitive) and writes back to their EXACT existing
  //    agent_name, so a real name's casing is never clobbered by the importer's guess
  //  - only ever sends fields that have an actual value in this row — a blank Power BI cell can
  //    no longer overwrite a populated field
  //  - computes Tier and Active Partner (retained) with the exact same formulas the RM Tracker
  //    uses (see shared formula notes below), so the two apps can't disagree from the same file
  //  - imports birthday/address too, closing a gap where this import previously left them alone
  var gd=function(v){
    if(v===null||v===undefined||v==="")return null;
    try{
      var d;
      if(v instanceof Date){d=v;}
      else if(typeof v==="number"&&v>1){d=new Date(Math.round((v-25569)*86400*1000));}
      else{d=new Date(v);}
      return(!isNaN(d.getTime())&&d.getFullYear()>1971)?d.toISOString().split("T")[0]:null;
    }catch(e){return null;}
  };
  var normalizePhoneShared=function(v){
    if(!v)return null;
    var digits=String(v).replace(/[^\d]/g,"");
    if(digits.length===11&&digits[0]==="1")digits=digits.slice(1);
    if(digits.length!==10)return String(v).trim()||null; // can't confidently reformat — keep rather than lose it
    return "("+digits.slice(0,3)+") "+digits.slice(3,6)+"-"+digits.slice(6);
  };
  var normalizeBirthdayShared=function(raw){
    if(!raw)return null;
    var s=String(raw).trim();
    if(!s)return null;
    var slash=s.match(/^(\d{1,2})\/(\d{1,2})$/);
    if(slash)return slash[1].padStart(2,"0")+"/"+slash[2].padStart(2,"0");
    var dash=s.match(/^(\d{1,2})-(\d{1,2})$/);
    if(dash)return dash[1].padStart(2,"0")+"/"+dash[2].padStart(2,"0");
    var months=["january","february","march","april","may","june","july","august","september","october","november","december"];
    var parts=s.toLowerCase().split(" ");
    if(parts.length>=2){
      var mi=months.findIndex(function(m){return m.indexOf(parts[0])===0;});
      var day=parseInt(parts[1]);
      if(mi>=0&&!isNaN(day)&&day>=1&&day<=31)return String(mi+1).padStart(2,"0")+"/"+String(day).padStart(2,"0");
    }
    return null; // couldn't confidently parse — don't write something wrong
  };

  // v82: use one identity key everywhere in the import. Power BI names can contain repeated
  // spaces/casing differences; verification and repair must resolve the same person the writer did.
  var powerBiAgentKey=function(v){
    return String(v||"").trim().toLowerCase().replace(/\s+/g," ");
  };
  var now=new Date();
  var ninetyDaysAgo=new Date(now.getTime()-90*86400000);
  // One identical stamp for every row in this Power BI upload. Portfolio Review uses this
  // to distinguish the CURRENT Power BI population from old/manual profiles that remain in history.
  var powerBiImportStamp=new Date().toISOString();

  var existing=await sbFetch("GET","agent_profiles?select=agent_name,tier,retained,email,phone,address,birthday,relationship_status&limit=5000").catch(function(){return sbFetch("GET","agent_profiles?select=agent_name,tier,retained,relationship_status&limit=5000").catch(function(){return sbFetch("GET","agent_profiles?select=agent_name,tier,retained&limit=5000").catch(function(){return[];});});});
  var existingByKey={},existingTierByKey={},existingActiveByKey={},existingContactByKey={},existingRelationshipStatusByKey={};
  (existing||[]).forEach(function(e){
    var k=powerBiAgentKey(e.agent_name);
    if(k&&!existingByKey[k]){existingByKey[k]=e.agent_name;existingTierByKey[k]=e.tier||null;existingActiveByKey[k]=!!e.retained;existingRelationshipStatusByKey[k]=e.relationship_status||"active";existingContactByKey[k]={email:e.email,phone:e.phone,address:e.address,birthday:e.birthday};} // first match wins if pre-existing casing duplicates exist — same known limitation flagged in the audit, not solved here
  });

  var tierChanges=[],activeChanges={becameActive:0,becameInactive:0};

  var toUpdate=[],toInsert=[];
  rows.forEach(function(row){
    var rawName=(row["Agent"]||"").toString().trim();
    if(!rawName||rawName.toUpperCase()==="AGENT"||rawName.toUpperCase()==="NAN"||ctExcludedFromActiveAgentRoster(rawName))return;
    var closes=parseInt(row["Closed Past Year"])||0;
    var leads=parseInt(row["Total Leads Past Year"])||0;
    // Shared formula (identical in the RM Tracker): Channel 10+, A 4-9, B 2-3, C requires at
    // least 1 close OR 1 lead — 0 and 0 gets no tier at all rather than defaulting to C.
    var tier=closes>=10?"Channel":closes>=4?"A":closes>=2?"B":(closes>=1||leads>=1)?"C":null;
    var latestLead=gd(row["Latest Lead (In Velocify)"]);
    var latestClose=gd(row["Latest Close"]);
    // Active Partner = a qualifying lead OR closing within the last 90 days — not just being
    // present in this file. Latest File Started / Latest Contract aren't "a lead or a closing"
    // per the draft operating standard's definition, so they're deliberately excluded from this check.
    var isActive=!!((latestLead&&new Date(latestLead)>=ninetyDaysAgo)||(latestClose&&new Date(latestClose)>=ninetyDaysAgo));

    var normalizedName=rawName.replace(/\s+/g," ").split(" ").map(function(w){return w?w.charAt(0).toUpperCase()+w.slice(1).toLowerCase():"";}).join(" ");
    var key=powerBiAgentKey(rawName);
    var canonicalName=existingByKey[key]||normalizedName; // preserve the real stored name/casing when this person is already known
    // A Power BI export is production data, not roster authority. Removed/inactive relationships
    // still get their latest production snapshot stamped for reconciliation, but this function NEVER
    // changes relationship_status or LP/RM ownership, so an import cannot resurrect them.
    var rosterInactive=existingRelationshipStatusByKey[key]==="inactive"||ctInactiveRosterNames.has(key);

    var rawPowerBiLevel=(row["Level"]||"").toString().trim().toUpperCase();
    var effectivePowerBiLevel=(rawPowerBiLevel==="A"||rawPowerBiLevel==="B"||rawPowerBiLevel==="C")?rawPowerBiLevel:(tier==="Channel"?"A":tier);
    var payload={agent_name:canonicalName,tier:tier,closes_past_year:closes,total_leads_past_year:leads,retained:isActive,
      powerbi_last_seen_at:powerBiImportStamp,powerbi_level:effectivePowerBiLevel||null};
    if(rosterInactive)payload.relationship_status="inactive"; // normalize legacy __REMOVED__ markers without reactivating anyone
    if(latestLead)payload.latest_lead_date=latestLead;
    if(latestClose)payload.latest_close_date=latestClose;
    // CORRECTED contact-field precedence: for an EXISTING agent, Power BI may only fill a
    // contact field when the current shared value is blank. A human-verified phone/email/
    // address/birthday is never silently overwritten by a different nonblank import value —
    // that's now treated as a conflict and the existing, human-maintained value wins. For a
    // brand-new agent there's nothing to conflict with, so Power BI's value is used normally.
    var existingContact=existingContactByKey[key]||null;
    var email=row["Email"]?row["Email"].toString().trim():"";
    if(email&&(!existingContact||!existingContact.email))payload.email=email;
    var phone=normalizePhoneShared(row["Phone Number"]);
    if(phone&&(!existingContact||!existingContact.phone))payload.phone=phone;
    var addr=row["Address"]?row["Address"].toString().trim():"";
    if(addr&&(!existingContact||!existingContact.address))payload.address=addr;
    var bday=normalizeBirthdayShared(row["Birthday"]);
    if(bday&&(!existingContact||!existingContact.birthday))payload.birthday=bday;
    // Power BI's Notes column is intentionally never mapped into personal_notes or any
    // relationship field here — those are hand-written relationship history, not something a
    // generic import column should be able to overwrite.

    if(existingByKey[key]){toUpdate.push(payload);}
    else{toInsert.push(payload);existingByKey[key]=canonicalName;} // guards a name appearing twice in one file

    // Tier history + Active Partner transition tracking — logged for every row with a
    // detectable change, existing agent or new, so Portfolio Review's tier-migration and
    // active-status trend reporting stays complete regardless of which app ran the import.
    var priorTier=existingTierByKey[key];
    if(!rosterInactive&&priorTier!==undefined&&priorTier!==tier&&(priorTier||tier)){
      tierChanges.push({agent_name:canonicalName,from_tier:priorTier,to_tier:tier});
    }
    var priorActive=existingActiveByKey[key];
    if(!rosterInactive&&priorActive!==undefined&&priorActive!==isActive){
      if(isActive)activeChanges.becameActive++;else activeChanges.becameInactive++;
    }
  });
  if(!toUpdate.length&&!toInsert.length)return{stamp:powerBiImportStamp,synced:0,created:0,failed:0,verified:0};

  var synced=0,created=0,failed=0,firstPassFailures=[];
  // Existing agents: PATCH by the exact canonical name, and REQUIRE a returned row. A 200 with
  // [] means the filter matched nothing; older code counted that as success and silently left the
  // prior Power BI stamp behind.
  for(var i=0;i<toUpdate.length;i++){
    var p=toUpdate[i];
    var body=Object.assign({},p);delete body.agent_name;
    try{
      var patched=await sbFetch("PATCH","agent_profiles?agent_name=eq."+encodeURIComponent(p.agent_name),body);
      if(!Array.isArray(patched)||patched.length<1)throw new Error("No profile row matched the update");
      synced++;
    }catch(e){
      failed++;firstPassFailures.push(p);
      console.error("Update failed for "+p.agent_name+":",e.message);
    }
  }
  // New agents: insert in batches first; failed batches are retried row-by-row below.
  for(var j=0;j<toInsert.length;j+=50){
    var batch=toInsert.slice(j,j+50);
    try{
      await sbFetch("POST","agent_profiles",batch);
      created+=batch.length;
    }catch(e){
      failed+=batch.length;
      Array.prototype.push.apply(firstPassFailures,batch);
      console.error("Insert batch failed:",e.message);
    }
  }

  // v71 repair pass: a failed PATCH/insert gets a merge-upsert by canonical agent_name.
  // This is intentionally row-by-row so optional contact fields can differ safely by agent.
  if(firstPassFailures.length){
    var repaired=0,stillFailed=[];
    for(var rp=0;rp<firstPassFailures.length;rp++){
      var retryPayload=firstPassFailures[rp];
      try{
        await sbFetch("POST","agent_profiles?on_conflict=agent_name",retryPayload);
        repaired++;
      }catch(repairErr){
        stillFailed.push(retryPayload);
        console.error("Profile repair failed for "+retryPayload.agent_name+":",repairErr.message);
      }
    }
    failed=stillFailed.length;
    synced+=repaired;
  }

  // v82 read-back verification. Verify the canonical row written for each unique workbook
  // agent. Do not compare against a differently-normalized raw workbook name, and do not count
  // header/NAN rows. This was the source of the false "missing agents" failure after a successful
  // local Power BI load.
  var payloadByKey=new Map();
  toUpdate.concat(toInsert).forEach(function(p){
    var k=powerBiAgentKey(p&&p.agent_name);
    if(k)payloadByKey.set(k,p);
  });
  var expectedKeys=[];
  rows.forEach(function(r){
    var raw=String(r&&r["Agent"]||"").trim();
    if(!raw||raw.toUpperCase()==="AGENT"||raw.toUpperCase()==="NAN")return;
    var rawKey=powerBiAgentKey(raw);
    var canonical=existingByKey[rawKey]||raw.replace(/\s+/g," ").split(" ").map(function(w){return w?w.charAt(0).toUpperCase()+w.slice(1).toLowerCase():"";}).join(" ");
    var k=powerBiAgentKey(canonical);
    if(k&&expectedKeys.indexOf(k)<0)expectedKeys.push(k);
  });

  async function verifyCurrentProfilePopulation(){
    var check=await sbFetch("GET","agent_profiles?select=agent_name,powerbi_level,powerbi_last_seen_at,closes_past_year,total_leads_past_year&limit=5000");
    var byKey=new Map();
    (check||[]).forEach(function(p){
      var k=powerBiAgentKey(p&&p.agent_name);
      if(!k)return;
      var prior=byKey.get(k);
      // If legacy duplicates exist, keep the row with the newest Power BI stamp.
      if(!prior||(Date.parse(p&&p.powerbi_last_seen_at||"")||0)>(Date.parse(prior&&prior.powerbi_last_seen_at||"")||0))byKey.set(k,p);
    });
    var missing=[];
    expectedKeys.forEach(function(k){
      var expected=payloadByKey.get(k),p=byKey.get(k);
      if(!expected){missing.push({key:k,name:k,reason:"no prepared payload"});return;}
      var gotMs=Date.parse(p&&p.powerbi_last_seen_at||"")||0;
      var expectedMs=Date.parse(powerBiImportStamp)||0;
      var stale=!p||Math.abs(gotMs-expectedMs)>5000;
      var productionMismatch=!!p&&(Number(p.closes_past_year||0)!==Number(expected.closes_past_year||0)||Number(p.total_leads_past_year||0)!==Number(expected.total_leads_past_year||0));
      if(stale||productionMismatch)missing.push({key:k,name:(expected&&expected.agent_name)||k,reason:stale?"missing/stale stamp":"production values did not match"});
    });
    return missing;
  }

  var missingRows=await verifyCurrentProfilePopulation();
  if(missingRows.length){
    console.warn("Power BI profile verification found "+missingRows.length+" missing/stale rows; repairing now.",missingRows);
    for(var mr=0;mr<missingRows.length;mr++){
      var miss=missingRows[mr],repairPayload=payloadByKey.get(miss.key);
      if(repairPayload){
        try{await sbFetch("POST","agent_profiles?on_conflict=agent_name",repairPayload);}
        catch(e){console.error("Final verification repair failed for "+repairPayload.agent_name+":",e.message);}
      }
    }
    missingRows=await verifyCurrentProfilePopulation();
  }
  if(missingRows.length){
    var missingNames=missingRows.slice(0,12).map(function(x){return x.name;}).join(", ");
    var extra=missingRows.length>12?" +"+(missingRows.length-12)+" more":"";
    throw new Error("Shared Power BI profile sync still needs attention for "+missingRows.length+" agent"+(missingRows.length===1?"":"s")+": "+missingNames+extra+". Workbook totals are still loaded locally; shared totals were not accepted as complete.");
  }

  failed=0;
  console.log("LP agent_profiles sync verified: "+(toUpdate.length+toInsert.length)+" of "+(toUpdate.length+toInsert.length)+" rows stamped for this upload.");

  // Tier history — reuses the existing tier_migrations table (already written to by the RM
  // Tracker's imports; this closes the gap where a Power BI upload run from Core Team never
  // logged a migration at all). Best-effort: never blocks the import if it fails.
  for(var t=0;t<tierChanges.length;t++){
    var tc=tierChanges[t];
    try{
      await sbFetch("POST","tier_migrations",{agent_name:tc.agent_name,from_tier:tc.from_tier,to_tier:tc.to_tier,migration_date:localDateStr(now)});
    }catch(e){console.warn("Tier migration log failed (non-critical):",e.message);}
  }

  // Import audit log — additive table (see SAFE_DATABASE_MIGRATIONS.sql). Records what this
  // import actually did so a management view can show import history without guessing from
  // side effects. Best-effort: a failure here never blocks or rolls back the import itself.
  try{
    await sbFetch("POST","powerbi_import_log",{
      imported_at:new Date().toISOString(),source_app:(typeof window.ctV83SummarySourceApp==='function'?window.ctV83SummarySourceApp(window.CT_POWERBI_SNAPSHOT||null):'core-team-tracker'),
      rows_processed:rows.length,matched:toUpdate.length,created:created,updated:synced,
      skipped:rows.length-toUpdate.length-toInsert.length,errors:failed,
      tier_changes:tierChanges.length,became_active:activeChanges.becameActive,became_inactive:activeChanges.becameInactive
    });
  }catch(e){console.warn("Import audit log failed (non-critical — table may not exist yet, see SAFE_DATABASE_MIGRATIONS.sql):",e.message);}
  return{stamp:powerBiImportStamp,synced:toUpdate.length,created:toInsert.length,failed:0,verified:toUpdate.length+toInsert.length};
}
window.lpSyncAgentProfilesFromUpload=lpSyncAgentProfilesFromUpload;

// Operating Standard Sec. 18 — Health Score historical snapshots (LP Tracker version).
// Called after every Power BI import so Portfolio Review can show quarter-over-quarter trends.
// Uses the same health-score logic as pfrHealthScore — one definition, consistent everywhere.
async function lpWriteHealthSnapshots(){
  var now=new Date();
  var snapshotDate=localDateStr(now);
  var PFR_TIER_TOUCH={Channel:14,A:14,B:30,C:60};
  var PFR_TIER_URGENT={Channel:21,A:21,B:45,C:90};

  var results=await Promise.all([
    sbFetch("GET","agent_profiles?select=agent_name,tier,retained,do_not_contact,relationship_status,latest_lead_date,competitor_risk_flag&limit=2000").catch(function(){return sbFetch("GET","agent_profiles?select=agent_name,tier,retained,do_not_contact,latest_lead_date,competitor_risk_flag&limit=2000").catch(function(){return[];});}),
    sbFetch("GET","amanda_activities?select=agent_name,act_date,outcome,act_type&order=act_date.desc&limit=3000").catch(function(){return[];}),
    sbFetch("GET","call_logs?select=agent_name,call_date,outcome&order=call_date.desc&limit=2000").catch(function(){return[];}),
    // Use Velocify for real last-lead-date — same source as Portfolio Review for consistency
    sbFetch("GET","velocify_leads?select=referral_partner_name,date_added&order=date_added.desc&limit=5000&date_added=gte."+(function(){var d=new Date();d.setFullYear(d.getFullYear()-1);return d.toISOString().slice(0,10);}())).catch(function(){return[];})
  ]);
  var allAgents=results[0]||[],allActs=results[1]||[],lpCalls=results[2]||[],allLeads=results[3]||[];

  var lastSeenRM={};
  allActs.forEach(function(a){var n=(a.agent_name||"").trim().toLowerCase();if(n&&!lastSeenRM[n]&&isMeaningfulOutcome(a.outcome,NOT_MEANINGFUL_RM_OUTCOMES,a.act_type))lastSeenRM[n]=a.act_date;});
  var lastSeenLP={};
  lpCalls.forEach(function(c){var n=(c.agent_name||"").trim().toLowerCase();if(n&&!lastSeenLP[n]&&isMeaningfulOutcome(c.outcome,NOT_MEANINGFUL_LP_OUTCOMES))lastSeenLP[n]=c.call_date;});
  var lastLeadByAgent={};
  allLeads.forEach(function(l){var raw=(l.referral_partner_name||"").trim();var keys=[raw.toLowerCase(),ctAgentNameKey(raw)].filter(Boolean);keys.forEach(function(n){if(!lastLeadByAgent[n]||l.date_added>lastLeadByAgent[n])lastLeadByAgent[n]=l.date_added;});});

  var active=allAgents.filter(function(a){return a.retained&&a.do_not_contact!==true&&a.relationship_status!=="inactive";});
  if(!active.length)return;

  var rows=active.map(function(a){
    var key=(a.agent_name||"").trim().toLowerCase();
    var matchKey=ctAgentNameKey(a.agent_name);
    var lastRM=lastSeenRM[key]||lastSeenRM[matchKey],lastLP=lastSeenLP[key]||lastSeenLP[matchKey];
    var daysRM=lastRM?Math.round((now-new Date(lastRM+"T12:00:00"))/86400000):null;
    var daysLP=lastLP?Math.round((now-new Date(lastLP+"T12:00:00"))/86400000):null;
    var daysAny=(daysRM===null&&daysLP===null)?null:Math.min(daysRM===null?Infinity:daysRM,daysLP===null?Infinity:daysLP);
    var tier=a.tier||null;
    var threshold=PFR_TIER_TOUCH[tier]||14;
    var urgent=PFR_TIER_URGENT[tier]||21;
    var vDate=lastLeadByAgent[key]||lastLeadByAgent[matchKey];
    var pDate=a.latest_lead_date;
    var bestLead=vDate&&pDate?(vDate>pDate?vDate:pDate):(vDate||pDate);
    var daysSinceLead=bestLead?Math.round((now-new Date(bestLead+"T12:00:00"))/86400000):null;
    var health=pfrHealthScore(daysSinceLead,daysAny,threshold,urgent,!!a.competitor_risk_flag);
    return{agent_name:a.agent_name,tier:tier||null,health_score:health,snapshot_date:snapshotDate};
  });

  // Batch in groups of 100
  for(var i=0;i<rows.length;i+=100){
    var batch=rows.slice(i,i+100);
    await sbFetch("POST","health_snapshots?on_conflict=agent_name,snapshot_date",batch).catch(function(e){
      console.warn("Health snapshot batch failed (non-critical):",e.message);
    });
  }
  console.log("LP health snapshots written for "+rows.length+" agents on "+snapshotDate);
}
window.lpWriteHealthSnapshots=lpWriteHealthSnapshots;

function openPortfolioReviewView(btn){
  if(typeof rmStopPolling==="function")rmStopPolling();
  if(typeof lpStopPolling==="function")lpStopPolling();
  currentUser=null;
  document.querySelectorAll(".who-btn").forEach(function(b){b.classList.remove("active");});
  if(btn)btn.classList.add("active");
  document.querySelectorAll(".view").forEach(function(v){v.classList.remove("active");});
  document.getElementById("view-portfolio").classList.add("active");
  pfrLoad();
}
window.openPortfolioReviewView=openPortfolioReviewView;

function pfrSwitchPeriod(period,btn){
  pfrPeriod=period;
  ["Week","Month","Quarter"].forEach(function(k){
    var b=document.getElementById("pfrBtn"+k);
    if(b)b.classList.toggle("active",k.toLowerCase()===period);
  });
  pfrLoad();
}
window.pfrSwitchPeriod=pfrSwitchPeriod;

function pfrTile(label,count,target,onclick){
  var t='<div'+(onclick?' onclick="'+onclick+'" style="cursor:pointer;text-align:center;background:var(--surface-2);border-radius:8px;padding:10px 6px"':' style="text-align:center;background:var(--surface-2);border-radius:8px;padding:10px 6px"')+'>'
    +'<div style="font-size:20px;font-weight:800;color:var(--text)">'+count+(target?'<span style="font-size:11px;font-weight:600;color:var(--text-3)"> / '+target+'</span>':'')+'</div>'
    +'<div style="font-size:10.5px;color:var(--text-3);margin-top:2px">'+label+'</div></div>';
  return t;
}
function pfrHealthTile(label,count,color,onclick){
  return '<div'+(onclick?' onclick="'+onclick+'" style="cursor:pointer;text-align:center;background:var(--surface-2);border-radius:8px;padding:10px 6px;border-bottom:3px solid '+color+'"':' style="text-align:center;background:var(--surface-2);border-radius:8px;padding:10px 6px;border-bottom:3px solid '+color+'"')+'>'
    +'<div style="font-size:20px;font-weight:800;color:'+color+'">'+count+'</div>'
    +'<div style="font-size:10.5px;color:var(--text-3);margin-top:2px">'+label+'</div></div>';
}
function pfrListRow(rank,name,detail){
  if(/^__Roster_delete_/i.test(String(name||'').trim()))return '';
  // Never let a missing optional detail render as the literal word "undefined".
  detail=(detail===undefined||detail===null||detail==="")?"—":detail;
  return '<div style="padding:8px 16px;border-bottom:1px solid var(--border-light);display:flex;align-items:center;gap:10px">'
    +(rank?'<span style="font-size:11px;font-weight:700;color:var(--text-3);width:16px;flex-shrink:0">'+rank+'</span>':'')
    +'<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:13px">'+escHtml(pfrProperCase(name))+'</div><div style="font-size:11px;color:var(--text-3)">'+detail+'</div></div>'
  +'</div>';
}

function pfrStatTile(label,value,onclick){
  return '<div'+(onclick?' onclick="'+onclick+'" style="cursor:pointer;background:var(--surface-2);border-radius:8px;padding:10px 12px"':' style="background:var(--surface-2);border-radius:8px;padding:10px 12px"')+'>'
    +'<div style="font-size:10.5px;color:var(--text-3);margin-bottom:4px">'+label+'</div>'
    +'<div style="font-size:17px;font-weight:800;color:var(--text)">'+value+'</div>'
  +'</div>';
}
function pfrActivityTile(label,count,target,onclick){
  var pct=target>0?Math.min(100,Math.round((count/target)*100)):0;
  var color=pct>=100?"#3E8E5A":pct>=60?"#B8842B":"#B54B42";
  return '<div'+(onclick?' onclick="'+onclick+'" style="cursor:pointer;background:var(--surface-2);border-radius:8px;padding:10px 12px"':' style="background:var(--surface-2);border-radius:8px;padding:10px 12px"')+'>'
    +'<div style="font-size:10.5px;color:var(--text-3);margin-bottom:4px">'+label+'</div>'
    +'<div style="font-size:16px;font-weight:800;color:var(--text)">'+count+'<span style="font-size:11px;font-weight:600;color:var(--text-3)"> / '+target+'</span></div>'
    +'<div style="height:5px;background:var(--border);border-radius:3px;margin-top:5px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:'+color+'"></div></div>'
  +'</div>';
}


// v41 — shared/raw Power BI reconciliation. The current approved upload is baked in as a safe
// fallback so Portfolio Review never mistakes the normalized roster count for raw uploaded rows.
// Future Admin uploads replace this in-browser and also write a compact shared summary into the
// existing powerbi_import_log.source_app field so other browsers can see the same totals.
var CT_DEFAULT_POWERBI_SNAPSHOT={"imported_at":"2026-08-19T19:39:00.000Z","raw_rows":151,"levels":{"A":13,"B":18,"C":117,"Blank":3,"Other":0},"active_prequals_total":405,"active_prequals_agents":91,"active_pipeline_total":42,"active_pipeline_agents":23,"closed_12mo_total":149,"closed_12mo_agents":64,"by_agent":{"leslie hernandez":{"name":"LESLIE HERNANDEZ","level":"B","active_prequals":3,"active_pipeline":0},"matt piper":{"name":"MATT PIPER","level":"B","active_prequals":0,"active_pipeline":0},"sahar shalash":{"name":"SAHAR SHALASH","level":"A","active_prequals":18,"active_pipeline":0},"todd stone":{"name":"TODD STONE","level":"A","active_prequals":13,"active_pipeline":1},"brian zinn":{"name":"BRIAN ZINN","level":"C","active_prequals":3,"active_pipeline":1},"bryce cargill":{"name":"BRYCE CARGILL","level":"C","active_prequals":1,"active_pipeline":0},"lexis grandy":{"name":"LEXIS GRANDY","level":"C","active_prequals":0,"active_pipeline":0},"tamara charlton":{"name":"TAMARA CHARLTON","level":"C","active_prequals":4,"active_pipeline":0},"alexis reed":{"name":"ALEXIS REED","level":"C","active_prequals":7,"active_pipeline":0},"ayleen diaz":{"name":"AYLEEN DIAZ","level":"C","active_prequals":0,"active_pipeline":0},"khadija farah":{"name":"KHADIJA FARAH","level":"B","active_prequals":4,"active_pipeline":0},"paige ludwig":{"name":"PAIGE LUDWIG","level":"C","active_prequals":6,"active_pipeline":0},"bailey strathie":{"name":"BAILEY STRATHIE","level":"C","active_prequals":1,"active_pipeline":1},"bob mccarthy":{"name":"BOB MCCARTHY","level":"C","active_prequals":0,"active_pipeline":1},"claudia chueco":{"name":"CLAUDIA CHUECO","level":"C","active_prequals":0,"active_pipeline":0},"rami tamimi":{"name":"RAMI TAMIMI","level":"B","active_prequals":5,"active_pipeline":0},"suni rivas":{"name":"SUNI RIVAS","level":"C","active_prequals":1,"active_pipeline":0},"angelique sotondji":{"name":"ANGELIQUE SOTONDJI","level":"C","active_prequals":0,"active_pipeline":0},"chris owens":{"name":"CHRIS OWENS","level":"C","active_prequals":0,"active_pipeline":0},"tiara villatoro":{"name":"TIARA VILLATORO","level":"A","active_prequals":5,"active_pipeline":0},"christina coughlin":{"name":"CHRISTINA COUGHLIN","level":"C","active_prequals":1,"active_pipeline":0},"kevin speert":{"name":"KEVIN SPEERT","level":"A","active_prequals":3,"active_pipeline":0},"megan lynch":{"name":"MEGAN LYNCH","level":"A","active_prequals":14,"active_pipeline":1},"mk yussuf":{"name":"MK YUSSUF","level":"C","active_prequals":0,"active_pipeline":0},"maria susana huntwork":{"name":"MARIA SUSANA HUNTWORK","level":"C","active_prequals":0,"active_pipeline":0},"brandon thompson":{"name":"BRANDON THOMPSON","level":"A","active_prequals":14,"active_pipeline":0},"ingrid correia":{"name":"INGRID CORREIA","level":"C","active_prequals":4,"active_pipeline":0},"chris reed":{"name":"CHRIS REED","level":"A","active_prequals":33,"active_pipeline":0},"kishma james":{"name":"KISHMA JAMES","level":"C","active_prequals":7,"active_pipeline":0},"john brunner":{"name":"JOHN BRUNNER","level":"B","active_prequals":9,"active_pipeline":0},"marychris willams":{"name":"MARYCHRIS WILLAMS","level":"C","active_prequals":0,"active_pipeline":0},"colin kochansky":{"name":"COLIN KOCHANSKY","level":"C","active_prequals":1,"active_pipeline":0},"jasmin arcos":{"name":"JASMIN ARCOS","level":"C","active_prequals":1,"active_pipeline":0},"kecia frye":{"name":"KECIA FRYE","level":"C","active_prequals":0,"active_pipeline":0},"mariana cortes":{"name":"MARIANA CORTES","level":"C","active_prequals":0,"active_pipeline":0},"jasmine mckenzie":{"name":"JASMINE MCKENZIE","level":"C","active_prequals":0,"active_pipeline":0},"kristina murphy":{"name":"KRISTINA MURPHY","level":"C","active_prequals":3,"active_pipeline":0},"racquel ludaway":{"name":"RACQUEL LUDAWAY","level":"A","active_prequals":17,"active_pipeline":0},"shayne boyd":{"name":"SHAYNE BOYD","level":"C","active_prequals":1,"active_pipeline":0},"lizbel contreras":{"name":"LIZBEL CONTRERAS","level":"C","active_prequals":3,"active_pipeline":0},"megan dodderer":{"name":"MEGAN DODDERER","level":"C","active_prequals":0,"active_pipeline":0},"oscar martinez":{"name":"OSCAR MARTINEZ","level":"A","active_prequals":24,"active_pipeline":0},"haifa brunney":{"name":"HAIFA BRUNNEY","level":"B","active_prequals":5,"active_pipeline":1},"tammy fast":{"name":"TAMMY FAST","level":"C","active_prequals":0,"active_pipeline":0},"wilber flores":{"name":"WILBER FLORES","level":"C","active_prequals":1,"active_pipeline":0},"maria comas":{"name":"MARIA COMAS","level":"C","active_prequals":3,"active_pipeline":0},"natalie estrella":{"name":"NATALIE ESTRELLA","level":"C","active_prequals":8,"active_pipeline":2},"jessica tower":{"name":"JESSICA TOWER","level":"C","active_prequals":0,"active_pipeline":0},"annie moreno":{"name":"ANNIE MORENO","level":"B","active_prequals":7,"active_pipeline":0},"luis gil":{"name":"LUIS GIL","level":"C","active_prequals":9,"active_pipeline":0},"tony amos":{"name":"TONY AMOS","level":"C","active_prequals":2,"active_pipeline":0},"deanne rhynehardt":{"name":"DEANNE RHYNEHARDT","level":"C","active_prequals":9,"active_pipeline":3},"jeff messmer":{"name":"JEFF MESSMER","level":"C","active_prequals":2,"active_pipeline":0},"rosalia pablo":{"name":"ROSALIA PABLO","level":"C","active_prequals":2,"active_pipeline":0},"conner kochansky":{"name":"CONNER KOCHANSKY","level":"A","active_prequals":3,"active_pipeline":0},"pilar bennett":{"name":"PILAR BENNETT","level":"C","active_prequals":4,"active_pipeline":0},"ava laird":{"name":"AVA LAIRD","level":"C","active_prequals":0,"active_pipeline":0},"georgena xammar":{"name":"GEORGENA XAMMAR","level":"C","active_prequals":1,"active_pipeline":1},"nick zatezalo":{"name":"NICK ZATEZALO","level":"C","active_prequals":2,"active_pipeline":0},"christian chalkias":{"name":"CHRISTIAN CHALKIAS","level":"C","active_prequals":1,"active_pipeline":0},"kathy hayes":{"name":"KATHY HAYES","level":"C","active_prequals":14,"active_pipeline":0},"elizabeth howard":{"name":"ELIZABETH HOWARD","level":"C","active_prequals":4,"active_pipeline":0},"amanda howard":{"name":"AMANDA HOWARD","level":"C","active_prequals":3,"active_pipeline":0},"katherine de la rosa":{"name":"KATHERINE DE LA ROSA","level":"B","active_prequals":2,"active_pipeline":0},"morgan stone":{"name":"MORGAN STONE","level":"C","active_prequals":0,"active_pipeline":0},"juane madaris":{"name":"JUANE MADARIS","level":"C","active_prequals":0,"active_pipeline":0},"shirrell burnside":{"name":"SHIRRELL BURNSIDE","level":"C","active_prequals":1,"active_pipeline":0},"jasmin montoya":{"name":"JASMIN MONTOYA","level":"C","active_prequals":2,"active_pipeline":0},"ross digiorgio":{"name":"ROSS DIGIORGIO","level":"C","active_prequals":2,"active_pipeline":1},"jonnathan agudelo":{"name":"JONNATHAN AGUDELO","level":"C","active_prequals":2,"active_pipeline":0},"dustin goldman":{"name":"DUSTIN GOLDMAN","level":"A","active_prequals":13,"active_pipeline":0},"matt braddy":{"name":"MATT BRADDY","level":"C","active_prequals":0,"active_pipeline":0},"gamal harding":{"name":"GAMAL HARDING","level":"C","active_prequals":0,"active_pipeline":0},"john lubinsky":{"name":"JOHN LUBINSKY","level":"C","active_prequals":3,"active_pipeline":0},"amy agresta":{"name":"AMY AGRESTA","level":"C","active_prequals":3,"active_pipeline":0},"sarah schumaker":{"name":"SARAH SCHUMAKER","level":"C","active_prequals":0,"active_pipeline":0},"nathan white":{"name":"NATHAN WHITE","level":"C","active_prequals":1,"active_pipeline":0},"heather emmert":{"name":"HEATHER EMMERT","level":"C","active_prequals":1,"active_pipeline":0},"timothy oliver":{"name":"TIMOTHY OLIVER","level":"C","active_prequals":1,"active_pipeline":0},"brandon mcclendon":{"name":"BRANDON MCCLENDON","level":"C","active_prequals":1,"active_pipeline":0},"tatiana grigorita":{"name":"TATIANA GRIGORITA","level":"C","active_prequals":0,"active_pipeline":0},"tom newman":{"name":"TOM NEWMAN","level":"C","active_prequals":3,"active_pipeline":0},"donald payne jr":{"name":"DONALD PAYNE JR","level":"C","active_prequals":0,"active_pipeline":0},"yvetta harrison":{"name":"YVETTA HARRISON","level":"C","active_prequals":0,"active_pipeline":0},"anthony amos":{"name":"ANTHONY AMOS","level":"C","active_prequals":5,"active_pipeline":0},"hypatia espinal":{"name":"HYPATIA ESPINAL","level":"C","active_prequals":2,"active_pipeline":0},"jaiden ballah":{"name":"JAIDEN BALLAH","level":"C","active_prequals":0,"active_pipeline":0},"celine williams":{"name":"CELINE WILLIAMS","level":"C","active_prequals":0,"active_pipeline":0},"carole mcmahon":{"name":"CAROLE MCMAHON","level":"C","active_prequals":6,"active_pipeline":0},"slavi jordanov":{"name":"SLAVI JORDANOV","level":"C","active_prequals":0,"active_pipeline":0},"sarah hernandez":{"name":"SARAH HERNANDEZ","level":"C","active_prequals":3,"active_pipeline":0},"courtney hamilton":{"name":"COURTNEY HAMILTON","level":"C","active_prequals":4,"active_pipeline":0},"justin biery":{"name":"JUSTIN BIERY","level":"C","active_prequals":0,"active_pipeline":0},"izxel martinez":{"name":"IZXEL MARTINEZ","level":"C","active_prequals":0,"active_pipeline":0},"benjamin gaytan":{"name":"BENJAMIN GAYTAN","level":"C","active_prequals":0,"active_pipeline":0},"brad gilliam":{"name":"BRAD GILLIAM","level":null,"active_prequals":1,"active_pipeline":0},"letika white":{"name":"LETIKA WHITE","level":"C","active_prequals":2,"active_pipeline":0},"sahel alam":{"name":"SAHEL ALAM","level":"C","active_prequals":1,"active_pipeline":0},"coda gahris":{"name":"CODA GAHRIS","level":null,"active_prequals":0,"active_pipeline":0},"patrick arquette":{"name":"PATRICK ARQUETTE","level":"C","active_prequals":0,"active_pipeline":0},"mary mcmichael":{"name":"MARY MCMICHAEL","level":"B","active_prequals":3,"active_pipeline":0},"matthew montalvo":{"name":"MATTHEW MONTALVO","level":"A","active_prequals":1,"active_pipeline":0},"mark vennitti":{"name":"MARK VENNITTI","level":"C","active_prequals":6,"active_pipeline":0},"heather henry-minor":{"name":"HEATHER HENRY-MINOR","level":"B","active_prequals":1,"active_pipeline":0},"elizabeth ellinger":{"name":"ELIZABETH ELLINGER","level":"B","active_prequals":1,"active_pipeline":0},"marychris williams":{"name":"MARYCHRIS WILLIAMS","level":"C","active_prequals":2,"active_pipeline":0},"patrick klein":{"name":"PATRICK KLEIN","level":null,"active_prequals":0,"active_pipeline":0},"martin hopkins":{"name":"MARTIN HOPKINS","level":"B","active_prequals":1,"active_pipeline":0},"addie gilkey":{"name":"ADDIE GILKEY","level":"C","active_prequals":0,"active_pipeline":0},"kandis hall":{"name":"KANDIS HALL","level":"B","active_prequals":10,"active_pipeline":1},"nancy price":{"name":"NANCY PRICE","level":"C","active_prequals":7,"active_pipeline":0},"angie bronowski":{"name":"ANGIE BRONOWSKI","level":"B","active_prequals":0,"active_pipeline":1},"deron bender":{"name":"DERON BENDER","level":"B","active_prequals":6,"active_pipeline":3},"michelle erickson":{"name":"MICHELLE ERICKSON","level":"A","active_prequals":1,"active_pipeline":2},"connor kochansky":{"name":"CONNOR KOCHANSKY","level":"C","active_prequals":1,"active_pipeline":0},"georgena starr":{"name":"GEORGENA STARR","level":"C","active_prequals":0,"active_pipeline":1},"tina hoffman":{"name":"TINA HOFFMAN","level":"C","active_prequals":8,"active_pipeline":4},"beth hazard":{"name":"BETH HAZARD","level":"C","active_prequals":0,"active_pipeline":0},"brian":{"name":"BRIAN","level":"C","active_prequals":0,"active_pipeline":0},"claudia chueca":{"name":"CLAUDIA CHUECA","level":"C","active_prequals":1,"active_pipeline":0},"colin burnheimer - thrive":{"name":"COLIN BURNHEIMER - THRIVE","level":"C","active_prequals":1,"active_pipeline":0},"deron benden":{"name":"DERON BENDEN","level":"C","active_prequals":0,"active_pipeline":1},"donald payne":{"name":"DONALD PAYNE","level":"C","active_prequals":0,"active_pipeline":0},"erika (rockford)":{"name":"ERIKA (ROCKFORD)","level":"C","active_prequals":0,"active_pipeline":1},"erika wehner":{"name":"ERIKA WEHNER","level":"B","active_prequals":2,"active_pipeline":2},"i'm a realtor partner.":{"name":"I'M A REALTOR PARTNER.","level":"C","active_prequals":0,"active_pipeline":0},"ingrid correa":{"name":"INGRID CORREA","level":"C","active_prequals":1,"active_pipeline":0},"jacob english":{"name":"JACOB ENGLISH","level":"C","active_prequals":0,"active_pipeline":0},"jen crim":{"name":"JEN CRIM","level":"C","active_prequals":0,"active_pipeline":0},"jesse mccrerry":{"name":"JESSE MCCRERRY","level":"C","active_prequals":0,"active_pipeline":0},"jordan hollibaugh":{"name":"JORDAN HOLLIBAUGH","level":"B","active_prequals":1,"active_pipeline":5},"katherie de la rosa":{"name":"KATHERIE DE LA ROSA","level":"C","active_prequals":0,"active_pipeline":0},"katie summers":{"name":"KATIE SUMMERS","level":"B","active_prequals":2,"active_pipeline":6},"khadija":{"name":"KHADIJA","level":"C","active_prequals":0,"active_pipeline":0},"kinsie huskins":{"name":"KINSIE HUSKINS","level":"C","active_prequals":0,"active_pipeline":0},"kunlavee":{"name":"KUNLAVEE","level":"C","active_prequals":1,"active_pipeline":0},"lisa simmons":{"name":"LISA SIMMONS","level":"C","active_prequals":0,"active_pipeline":0},"makayla & conner kochansky":{"name":"MAKAYLA & CONNER KOCHANSKY","level":"C","active_prequals":0,"active_pipeline":0},"mathea arudda":{"name":"MATHEA ARUDDA","level":"C","active_prequals":0,"active_pipeline":1},"michele frederick":{"name":"MICHELE FREDERICK","level":"C","active_prequals":0,"active_pipeline":0},"michelle holtz":{"name":"MICHELLE HOLTZ","level":"C","active_prequals":1,"active_pipeline":0},"paula palleschi":{"name":"PAULA PALLESCHI","level":"C","active_prequals":0,"active_pipeline":0},"realtor":{"name":"REALTOR","level":"C","active_prequals":0,"active_pipeline":0},"rockford":{"name":"ROCKFORD","level":"C","active_prequals":0,"active_pipeline":0},"rockford homes":{"name":"ROCKFORD HOMES","level":"C","active_prequals":1,"active_pipeline":0},"sara bush":{"name":"SARA BUSH","level":"C","active_prequals":0,"active_pipeline":0},"self":{"name":"SELF","level":"C","active_prequals":1,"active_pipeline":0},"slavisha jordanov":{"name":"SLAVISHA JORDANOV","level":"C","active_prequals":1,"active_pipeline":0},"tina hoffman (rockford)":{"name":"TINA HOFFMAN (ROCKFORD)","level":"C","active_prequals":0,"active_pipeline":0},"traci williams-jones":{"name":"TRACI WILLIAMS-JONES","level":"C","active_prequals":0,"active_pipeline":0},"tracy berard":{"name":"TRACY BERARD","level":"B","active_prequals":0,"active_pipeline":0}}};
function ctParsePowerBiSummaryFromSourceApp(sourceApp,importedAt){
  var s=String(sourceApp||"");
  if(s.indexOf("core-team-tracker")!==0)return null;
  var out={imported_at:importedAt||null,raw_rows:0,levels:{Channel:0,A:0,B:0,C:0,Blank:0,Other:0},active_prequals_total:0,active_prequals_agents:0,active_pipeline_total:0,active_pipeline_agents:0,closed_12mo_total:0,closed_12mo_agents:0,by_agent:null};
  s.split(";").slice(1).forEach(function(part){var p=part.split("=");if(p.length<2)return;var k=p[0],v=Number(p.slice(1).join("="))||0;if(k==="raw")out.raw_rows=v;else if(k==="Channel")out.levels.Channel=v;else if(k==="A")out.levels.A=v;else if(k==="B")out.levels.B=v;else if(k==="C")out.levels.C=v;else if(k==="blank")out.levels.Blank=v;else if(k==="other")out.levels.Other=v;else if(k==="preq")out.active_prequals_total=v;else if(k==="preqAgents")out.active_prequals_agents=v;else if(k==="pipe")out.active_pipeline_total=v;else if(k==="pipeAgents")out.active_pipeline_agents=v;else if(k==="closed")out.closed_12mo_total=v;else if(k==="closedAgents")out.closed_12mo_agents=v;});
  return out.raw_rows?out:null;
}
function ctPowerBiSummarySourceApp(snapshot){
  var s=snapshot||{};var l=s.levels||{};
  return "core-team-tracker;raw="+(Number(s.raw_rows)||0)+";Channel="+(Number(l.Channel)||0)+";A="+(Number(l.A)||0)+";B="+(Number(l.B)||0)+";C="+(Number(l.C)||0)+";blank="+(Number(l.Blank)||0)+";other="+(Number(l.Other)||0)+";preq="+(Number(s.active_prequals_total)||0)+";preqAgents="+(Number(s.active_prequals_agents)||0)+";pipe="+(Number(s.active_pipeline_total)||0)+";pipeAgents="+(Number(s.active_pipeline_agents)||0)+";closed="+(Number(s.closed_12mo_total)||0)+";closedAgents="+(Number(s.closed_12mo_agents)||0);
}

// Pull the newest compact Power BI summary written by any LP Tracker browser.
// This keeps Partner Growth consistent for Nyny, Mack and every LP instead of
// relying only on the localStorage of the browser that performed the upload.
async function ctHydrateSharedPowerBiSnapshot(){
 try{
  const verified=await ctGetLivePowerBiSummary(true);
  if(!verified||verified.verified!==true)throw new Error('Shared Power BI import not validated');
  const logs=await sbFetch('GET','powerbi_import_log?select=imported_at,source_app,rows_processed&source_app=like.core-team-tracker%25&order=imported_at.desc&limit=1');
  const row=logs&&logs[0],summary=row?ctParsePowerBiSummaryFromSourceApp(row.source_app,row.imported_at):null;
  if(!summary||summary.imported_at!==verified.imported_at)throw new Error('Shared import timestamp changed during refresh');
  const profiles=await sbFetch('GET','agent_profiles?select=agent_name,powerbi_level,powerbi_last_seen_at,closes_past_year,total_leads_past_year&powerbi_last_seen_at=not.is.null&limit=5000');
  const stamp=decodeURIComponent((String(row.source_app||'').match(/(?:^|;)profileStamp=([^;]+)/)||[])[1]||'')||row.imported_at;
  const ms=Date.parse(stamp),by=new Map();
  (profiles||[]).forEach(p=>{if(Math.abs(Date.parse(p.powerbi_last_seen_at||'')-ms)>=1000)return;const k=String(p.agent_name||'').trim().toLowerCase().replace(/\s+/g,' ');if(k)by.set(k,p);});
  var cohortTier={A:0,B:0,C:0};by.forEach(p=>{var lv=String(p.powerbi_level||'').toUpperCase();if(cohortTier[lv]!==undefined)cohortTier[lv]++});
  var acknowledged=ctIsAcknowledgedNov9RosterExclusion(Number(row.rows_processed),by.size,cohortTier.A,cohortTier.B,cohortTier.C,stamp);
  if(by.size!==Number(row.rows_processed)&&!acknowledged)throw new Error('Shared agent detail batch incomplete');
  if(acknowledged){summary.raw_source_rows=Number(row.rows_processed);summary.raw_rows=by.size;summary.active_partner_rows=by.size;summary.levels=Object.assign({},summary.levels||{},{A:cohortTier.A,B:cohortTier.B,C:cohortTier.C});}
  summary.by_agent={};
  by.forEach((p,k)=>{summary.by_agent[k]={name:p.agent_name,level:p.powerbi_level,closed_12mo:Number(p.closes_past_year||0),total_leads_12mo:Number(p.total_leads_past_year||0)};});
  summary.verified_server=true;
  window.__ctVerifiedSharedPowerBiSnapshot=summary;
  window.CT_POWERBI_SNAPSHOT=summary;
  ctPowerBiWarning(null);
  return summary;
 }catch(e){
  window.__ctVerifiedSharedPowerBiSnapshot=null;
  window.CT_POWERBI_SNAPSHOT=null;
  ctPowerBiWarning(e.message||'Server unavailable');
  throw e;
 }
}
function pfrCurrentPowerBiSource(profiles,importRow,localSnapshot){
  var stamp=null;
  profiles.forEach(function(p){if(p.powerbi_last_seen_at&&(!stamp||Date.parse(p.powerbi_last_seen_at)>Date.parse(stamp)))stamp=p.powerbi_last_seen_at;});
  var stamped=stamp?profiles.filter(function(p){return !ctExcludedFromActiveAgentRoster(p.agent_name)&&p.powerbi_last_seen_at&&Math.abs(Date.parse(p.powerbi_last_seen_at)-Date.parse(stamp))<120000;}):[];
  // Multiple legacy profiles can refer to one real agent. Never count both.
  var byAgent=new Map();
  stamped.forEach(function(p){
    var key=String(p.agent_name||'').trim().toLowerCase().replace(/\s+/g,' ');
    if(!key||/^__roster_delete_/i.test(key))return;
    var existing=byAgent.get(key),lv=String(p.powerbi_level||'').toUpperCase();
    if(!existing||(!['A','B','C'].includes(String(existing.powerbi_level||'').toUpperCase())&&['A','B','C'].includes(lv)))byAgent.set(key,p);
  });
  var current=Array.from(byAgent.values());
  var counts={A:0,B:0,C:0,Blank:0,Other:0,Channel:0};
  current.forEach(function(p){var level=String(p.powerbi_level||'').trim().toUpperCase();if(level==='A'||level==='B'||level==='C')counts[level]++;else if(!level)counts.Blank++;else counts.Other++;if(Number(p.closes_past_year||0)>=10)counts.Channel++;});
  var receipt=importRow?ctParsePowerBiSummaryFromSourceApp(importRow.source_app,importRow.imported_at):null;
  var receiptMs=Date.parse(receipt&&receipt.imported_at||'')||0,profileMs=Date.parse(stamp||'')||0;
  var useReceipt=!!receipt&&(!profileMs||receiptMs>=profileMs-15*60*1000);
  if(!useReceipt&&!profileMs)throw new Error('No current shared Power BI upload is available. Upload the report in Weekly Data Hub.');
  // Agent-level stamped records are authoritative for active membership. An import
  // receipt is aggregate-only and can include an unclassified/removed agent.
  // Retain its pipeline numbers, but never let it override a reconciled roster.
  var cohortTotal=Number(counts.A||0)+Number(counts.B||0)+Number(counts.C||0);
  var receiptTotal=receipt?Number(receipt.levels.A||0)+Number(receipt.levels.B||0)+Number(receipt.levels.C||0):0;
  var receiptMismatch=!!receipt&&cohortTotal>0&&receiptTotal!==cohortTotal;
  var source=useReceipt?receipt:null,levels=(cohortTotal>0?counts:(source?source.levels:counts)),
      sourceStamp=(cohortTotal>0?stamp:(source?source.imported_at:stamp));
  var snapMs=Date.parse(localSnapshot&&localSnapshot.imported_at||'')||0;
  var matchingLocal=localSnapshot&&snapMs&&Math.abs(snapMs-Date.parse(sourceStamp))<15*60*1000&&
    ['A','B','C'].every(function(k){return Number(localSnapshot.levels&&localSnapshot.levels[k]||0)===Number(levels[k]||0);});
  var detail=matchingLocal?localSnapshot:null;
  var total=Number(levels.A||0)+Number(levels.B||0)+Number(levels.C||0);
  if(!total)throw new Error('Current Power BI upload has no A/B/C agents. Check the uploaded Level column.');
  var profileTotal=Number(counts.A||0)+Number(counts.B||0)+Number(counts.C||0);
  return {levels:levels,stamp:sourceStamp,rawRows:source?source.raw_rows:(detail?detail.raw_rows:null),
    pipeline:source||detail,detail:detail,profiles:current,profileTotal:profileTotal,total:total,
    syncNote:receiptMismatch?'Import receipt reports '+receiptTotal+' agents but the current classified roster contains '+cohortTotal+'. Using the agent-level roster; receipt needs reconciliation.':(profileTotal!==total?'Agent-level profiles show '+profileTotal+' of '+total+' active Power BI agents.':''),
    receiptMismatch:receiptMismatch,
    source:source?'shared Power BI import receipt':'latest shared Power BI agent profiles'};
}
window.pfrCurrentPowerBiSource=pfrCurrentPowerBiSource;
function pfrBuildMeetingAgenda(input){
  var i=input;
  var leadDate=i.latestLeadDate?new Date(i.latestLeadDate+'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric'}):'the latest sync';
  return {sections:[
    {key:'tier',minutes:8,title:'Tier growth',result:i.tierPoints.toFixed(1)+'/50 points. Channel '+i.channel+'/'+i.milestone.Channel+', A '+i.a+'/'+i.milestone.A+', B '+i.b+'/'+i.milestone.B+'.',
      context:'These are candidates based on the current Power BI profiles, not confirmed tier changes.',people:i.nearNames.length?i.nearNames:['No near-tier candidates identified in the current profiles.'],
      talkingPoints:['Review the pipeline and opportunity shown for each candidate.','Choose the 2–3 relationships with the clearest path to the next funded closing.','Confirm the exact next move, one accountable owner, and a due date.'],
      question:'Choose the 2–3 highest-opportunity tier-growth relationships. Record the exact next move, owner and due date.'},
    {key:'referrals',minutes:10,title:'Portfolio & pipeline',result:i.currentMonthLeads+' leads MTD · '+i.activeContracts+' active contracts · '+i.preapprovedBuyers+' preapproved buyers · '+i.powerBiActiveCount+' active partners.',
      context:'Referral score: '+i.referralPoints.toFixed(1)+'/30. '+i.priorLabel+': '+i.priorMonthLeads+' leads / '+i.powerBiActiveCount+' active partners = '+(i.powerBiActiveCount?i.priorMonthLeads/i.powerBiActiveCount:0).toFixed(2)+' (goal 1.15). Active partner growth: '+i.activePoints.toFixed(1)+'/20; '+i.powerBiActiveCount+'/200. '+(i.velocifyCheckpointNote||'Velocify MTD is current through '+leadDate+'.'),
      people:i.topReferrers.length?i.topReferrers.map(function(r){return r.name+' — '+r.count+' '+new Date(i.latestLeadDate+'T12:00:00').toLocaleDateString('en-US',{month:'long'})+' referrals';}):['No current-month referrers in the synced lead data.'],
      talkingPoints:['What is converting right now: leads → preapprovals → active contracts?','Which preapproved buyers need an agent introduction, property strategy, or another push toward contract?','Who is sending us business right now, and which active partners have room to send more?','Where do we have pipeline sitting without movement, and what is blocking the next step?','Which 2–3 relationships or buyer opportunities can we move this week, and what specific value will we bring?'],
      question:'Choose up to three portfolio or pipeline actions. Record the partner or opportunity, specific next move, owner and due date.'},
    {key:'health',minutes:9,title:'Relationship health',result:i.redCount+' red; '+i.yellowCount+' yellow; '+i.missingNextMove+' managed relationships have no documented next move.',
      context:i.redNoTouch+' red relationships have no meaningful touch in the loaded history. Check history before assigning recovery; red and missing-next-move counts can overlap.',
      people:i.riskNames.length?i.riskNames:['Open Health to select relationships from the shared profiles.'],
      talkingPoints:['Which red or yellow relationships are highest value and need attention first?','Is the last lead or touch history missing, or is the relationship genuinely cooling?','Which partners have no documented next move even though the relationship is active?','Who owns the reconnect, what value will they lead with, and what outcome are we trying to get?'],
      question:'Select up to three priority relationships and record the recovery or next-step action, owner and due date.'},
    {key:'review',minutes:3,title:'Commitments and review date',result:'',context:'Read back the highest-priority actions, confirm one accountable owner for each, and set the follow-up date. Keep the meeting to decisions that can move tiers, referrals, or relationship health.',people:[],talkingPoints:[],question:'What are the 3–5 commitments coming out of this meeting, who owns each one, and when will we review progress?'}
  ]};
}
async function pfrLoad(){
  var body=document.getElementById("pfr-body");
  if(!body)return;
  pfrDrill={};
  body.innerHTML='<div style="text-align:center;padding:32px;color:var(--text-3);font-size:13px">Loading...</div>';
  try{
    var range=pfrPeriodRange();
    var now=new Date();
    var results=await Promise.all([
      sbFetch("GET","agent_profiles?select=*&limit=2000"),
      sbFetch("GET","amanda_activities?select=agent_name,act_date,outcome,act_type&order=act_date.desc&limit=3000"),
      sbFetch("GET","call_logs?select=agent_name,call_date,outcome&order=call_date.desc&limit=3000"),
      sbFetch("GET","tier_migrations?select=agent_name,from_tier,to_tier,migration_date&migration_date=gte."+range.start+"&migration_date=lte."+range.end+"&limit=1000"),
      sbFetch("GET","velocify_leads?date_added=gte."+range.start+"&date_added=lte."+range.end+"&select=referral_partner_name&limit=5000"),
      // Operating Standard Agent-to-Lead Ratio is monthly. Pull current-month Velocify leads, then show
      // MTD actual plus a projected month-end pace so early-month partial data isn't misread.
      sbFetch("GET","velocify_leads?date_added=gte."+(function(){var d=new Date();return new Date(d.getFullYear(),d.getMonth(),1).toISOString().slice(0,10);}())+"&select=referral_partner_name,date_added&limit=5000"),
      sbFetch("GET","amanda_activities?select=agent_name,act_type,act_date,outcome,notes&act_date=gte."+range.start+"&act_date=lte."+range.end+"&limit=3000"),
      sbFetch("GET","break_breads?select=agent_name,date&order=date.desc&limit=3000").catch(function(){return[];}),
      // Real last-lead-date per agent from Velocify (trailing 12 months) — more accurate than
      // latest_lead_date on agent_profiles, which only updates when the Power BI import runs.
      sbFetch("GET","velocify_leads?select=referral_partner_name,date_added&order=date_added.desc&limit=5000&date_added=gte."+(function(){var d=new Date();d.setFullYear(d.getFullYear()-1);return d.toISOString().slice(0,10);}())),
      sbFetch("GET","powerbi_import_log?select=imported_at,source_app,rows_processed,matched,created,updated,skipped,errors&order=imported_at.desc&limit=20").catch(function(){return[];})
    ]);
    var allAgents=results[0]||[],allActs=results[1]||[],lpCalls=results[2]||[],migrations=results[3]||[],periodLeads=results[4]||[],monthLeads=results[5]||[],periodActs=results[6]||[],allBreads=results[7]||[],allLeads=results[8]||[],importLogs=results[9]||[],lastImportLog=(importLogs||[]).find(function(r){return String(r.source_app||"").indexOf("core-team-tracker")===0;})||null;
    if(allAgents.length>=2000||monthLeads.length>=5000||allLeads.length>=5000)throw new Error('Portfolio source exceeded its record limit. Counts are unavailable until the full source can be loaded.');

    // Build real last-lead-date per agent from Velocify — keyed by lowercase name for matching
    var lastLeadDateByAgent={};
    allLeads.forEach(function(l){
      var raw=(l.referral_partner_name||"").trim();
      var keys=[raw.toLowerCase(),ctAgentNameKey(raw)].filter(Boolean);
      keys.forEach(function(n){if(!lastLeadDateByAgent[n]||l.date_added>lastLeadDateByAgent[n])lastLeadDateByAgent[n]=l.date_added;});
    });

    var lastSeenRM={};
    // Last MEANINGFUL contact — same shared classifier as the RM Tracker (see top of file), so
    // a voicemail or unanswered call doesn't count as a touch in either app's calculation.
    allActs.forEach(function(a){var n=(a.agent_name||"").trim().toLowerCase();if(n&&a.act_date&&isMeaningfulOutcome(a.outcome,NOT_MEANINGFUL_RM_OUTCOMES,a.act_type)&&(!lastSeenRM[n]||a.act_date>lastSeenRM[n]))lastSeenRM[n]=a.act_date;});
    var lastSeenLP={};
    lpCalls.forEach(function(c){var n=(c.agent_name||"").trim().toLowerCase();if(n&&c.call_date&&isMeaningfulOutcome(c.outcome,NOT_MEANINGFUL_LP_OUTCOMES)&&(!lastSeenLP[n]||c.call_date>lastSeenLP[n]))lastSeenLP[n]=c.call_date;});
    // All-time last "meeting" (Partner Meeting act_type OR a Break Bread) per agent — drives
    // formal Meeting Cadence Compliance, which is distinct from the touch-cadence check above.
    var lastMeeting={};
    var PFR_EXISTING_MEETING_TYPES=["Partner Meeting","Strategic Partner Meeting","Channel Meeting","Team / Office Presentation","Retention Meeting"];
    // Formal meeting cadence includes every held existing-partner meeting type used by the RM Tracker,
    // not only the generic Partner Meeting label. Fetch activity type too so strategic, Channel,
    // retention and team/office presentations are not accidentally treated as "no meeting."
    var results2=await sbFetch("GET","amanda_activities?select=agent_name,act_date,act_type&order=act_date.desc&limit=4000").catch(function(){return[];});
    (results2||[]).filter(function(a){return PFR_EXISTING_MEETING_TYPES.indexOf(a.act_type)>=0;}).forEach(function(a){var n=(a.agent_name||"").trim().toLowerCase();if(n&&(!lastMeeting[n]||a.act_date>lastMeeting[n]))lastMeeting[n]=a.act_date;});
    allBreads.forEach(function(b){var n=(b.agent_name||"").trim().toLowerCase();if(n&&(!lastMeeting[n]||b.date>lastMeeting[n]))lastMeeting[n]=b.date;});

    // Reconcile Portfolio Review to the LATEST Power BI upload. agent_profiles intentionally
    // keeps historical/manual records, so counting every retained=true row can inflate the current portfolio.
    var localPbSnapshot=window.CT_POWERBI_SNAPSHOT||null;
    if(!localPbSnapshot){try{localPbSnapshot=JSON.parse(localStorage.getItem('ct_powerbi_snapshot_v1')||'null');}catch(e){localPbSnapshot=null;}}
    var pbSource=pfrCurrentPowerBiSource(allAgents,lastImportLog,localPbSnapshot);
    var sharedPopulation=await window.ctGetLivePowerBiSummary(false);
    if(sharedPopulation && sharedPopulation.source_levels && Number(sharedPopulation.active_partner_rows)>0){
      // Do not replace a verified name-by-name roster with an aggregate or
      // localStorage summary of a different (possibly older) import.
      var summaryCount=Number(sharedPopulation.active_partner_rows);
      var rosterCount=Number(pbSource.profileTotal||0);
      var summaryStamp=Date.parse(sharedPopulation.stamp||'')||0;
      var rosterStamp=Date.parse(pbSource.stamp||'')||0;
      if(!rosterCount || (summaryCount===rosterCount&&summaryStamp>=rosterStamp-15*60000)){
        pbSource.levels=Object.assign({},pbSource.levels,sharedPopulation.source_levels);
        pbSource.total=summaryCount;
        pbSource.stamp=sharedPopulation.stamp||pbSource.stamp;
        pbSource.rawRows=sharedPopulation.raw_rows;
      }else{
        pbSource.syncNote=(pbSource.syncNote?pbSource.syncNote+' ':'')+
          'Power BI summary says '+summaryCount+'; classified roster says '+rosterCount+'. Using the classified roster.';
      }
    }
    var latestPowerBiStamp=pbSource.stamp;
    var currentPowerBiAgents=pbSource.profiles;
    var powerBiActiveAgents=currentPowerBiAgents.filter(function(a){return !!a.powerbi_level;}).length;
    var currentPowerBiPopulation=currentPowerBiAgents.length;
    var currentRosterRelationships=currentPowerBiAgents.filter(function(a){return a.relationship_status!=="inactive";});
    var inactiveRemovedCount=currentPowerBiAgents.filter(function(a){return a.relationship_status==="inactive";}).length;
    var rmActivePartners=currentPowerBiAgents.filter(function(a){return !!a.retained;});
    var dncActiveCount=rmActivePartners.filter(function(a){return a.do_not_contact===true&&a.relationship_status!=="inactive";}).length;
    var inactiveActiveCount=rmActivePartners.filter(function(a){return a.relationship_status==="inactive";}).length;
    var active=rmActivePartners.filter(function(a){return a.do_not_contact!==true&&a.relationship_status!=="inactive";});
    var totalActive=active.length;
    var powerBiLevelCounts={A:0,B:0,C:0,Blank:0,Other:0};
    currentPowerBiAgents.forEach(function(a){var lv=String(a.powerbi_level||"").trim();if(lv==="A"||lv==="B"||lv==="C")powerBiLevelCounts[lv]++;else if(!lv)powerBiLevelCounts.Blank++;else powerBiLevelCounts.Other++;});
    var pbSnapshot=pbSource.detail||pbSource.pipeline;
    var uploadedRows=pbSource.rawRows==null?'Unavailable':pbSource.rawRows;
    var displayPbLevels=pbSource.levels;
    var powerBiActiveCount=Number(displayPbLevels.A||0)+Number(displayPbLevels.B||0)+Number(displayPbLevels.C||0);
    var powerBiNoLevelCount=Number(displayPbLevels.Blank||0)+Number(displayPbLevels.Other||0);
    var pbPipeline={prequalsTotal:pbSnapshot?pbSnapshot.active_prequals_total:null,prequalsAgents:pbSnapshot?pbSnapshot.active_prequals_agents:null,pipelineTotal:pbSnapshot?pbSnapshot.active_pipeline_total:null,pipelineAgents:pbSnapshot?pbSnapshot.active_pipeline_agents:null,closedTotal:pbSnapshot?pbSnapshot.closed_12mo_total:null,closedAgents:pbSnapshot?pbSnapshot.closed_12mo_agents:null};

    // Tier Migration is a managed-portfolio metric. Exclude removed/inactive/DNC agents and
    // null-tier transitions (for example C → ?), because "no tier" is not a real migration.
    // This also hides legacy false migration rows that were already written before this fix.
    var managedNameSet={};
    active.forEach(function(a){var n=(a.agent_name||"").trim().toLowerCase();if(n)managedNameSet[n]=true;});
    var validMigrationTiers={C:true,B:true,A:true,Channel:true};
    migrations=migrations.filter(function(m){
      var n=(m.agent_name||"").trim().toLowerCase();
      return !!managedNameSet[n]&&!!validMigrationTiers[m.from_tier]&&!!validMigrationTiers[m.to_tier]&&m.from_tier!==m.to_tier;
    });

    var FORMAL_CADENCE={Channel:30,A:30,B:60,C:90};
    var rows=active.map(function(a){
      var name=(a.agent_name||"").trim();
      var key=name.toLowerCase();
      var matchKey=ctAgentNameKey(name);
      var lastRM=lastSeenRM[key]||lastSeenRM[matchKey],lastLP=lastSeenLP[key]||lastSeenLP[matchKey];
      var daysRM=lastRM?Math.round((now-new Date(lastRM+"T12:00:00"))/86400000):null;
      var daysLP=lastLP?Math.round((now-new Date(lastLP+"T12:00:00"))/86400000):null;
      var daysAny=(daysRM===null&&daysLP===null)?null:Math.min(daysRM===null?Infinity:daysRM,daysLP===null?Infinity:daysLP);
      var tier=a.tier||null;
      var threshold=PFR_TIER_TOUCH[tier]||14;
      var urgent=PFR_TIER_URGENT[tier]||21;
      var lastLeadDate=null,leadSource="Unknown";
      var daysSinceLead=(function(){
        // Prefer Velocify's real last-lead-date; fall back to agent_profiles.latest_lead_date
        // (which only updates when the Power BI import runs and may be weeks stale)
        var vDate=lastLeadDateByAgent[key]||lastLeadDateByAgent[matchKey];
        var pDate=a.latest_lead_date;
        var best=vDate&&pDate?(vDate>pDate?vDate:pDate):(vDate||pDate);
        lastLeadDate=best||null;leadSource=vDate&&best===vDate?"Velocify":(best?"Agent profile (sync unverified)":"Unknown");
        return best?Math.max(0,Math.round((now-new Date(best+"T12:00:00"))/86400000)):null;
      }());
      var health=pfrHealthScore(daysSinceLead,daysAny,threshold,urgent,!!a.competitor_risk_flag);
      var daysToYellowTouch=daysAny===null?null:threshold-daysAny;
      var daysToYellowLead=daysSinceLead===null?null:30-daysSinceLead;
      var candidates=[daysToYellowTouch,daysToYellowLead].filter(function(d){return Number.isFinite(d)&&d>0;});
      var daysUntilYellow=candidates.length?Math.min.apply(null,candidates):null;
      var watchReasons=[];
      if(daysToYellowLead!==null&&daysToYellowLead>0&&daysToYellowLead<=7)watchReasons.push("Referral inactivity: "+daysSinceLead+" days since last lead (30-day threshold; "+daysToYellowLead+" days remaining). Last lead "+(lastLeadDate||"unknown")+"; source: "+leadSource+".");
      if(daysToYellowTouch!==null&&daysToYellowTouch>0&&daysToYellowTouch<=7)watchReasons.push("Contact cadence: "+daysAny+" days since meaningful conversation ("+threshold+"-day "+(tier||"unknown")+" tier threshold; "+daysToYellowTouch+" days remaining).");
      var watchAction=daysToYellowLead!==null&&daysToYellowLead>0&&daysToYellowLead<=7?"Check recent referrals and schedule a business conversation.":"Schedule a meaningful conversation before the contact deadline.";
      return{name:name,tier:tier,health:health,daysAny:daysAny,daysSinceLead:daysSinceLead,daysUntilYellow:daysUntilYellow,watchReasons:watchReasons,watchAction:watchAction,
        next_growth_opportunity:a.next_growth_opportunity||null,satisfaction:(function(v){var n=Number(v);return v!==null&&v!==undefined&&String(v).trim()!==""&&Number.isFinite(n)&&n>=1&&n<=5?n:null;})(a.satisfaction_rating),
        high_potential:!!a.high_potential_flag,recovery_plan:a.recovery_plan||null,agent:a};
    });

    var countByTier={Channel:0,A:0,B:0,C:0,None:0};
    active.forEach(function(a){var t=a.tier&&countByTier.hasOwnProperty(a.tier)?a.tier:"None";countByTier[t]++;});

    var leadsThisPeriod=periodLeads.length;
    var leadsMTD=monthLeads.length;
    // Sep 24 manual checkpoint from the latest Velocify tracker. Zapier/shared rows may lag until ~8 PM.
    // It only raises the headline total while shared Velocify is behind; once shared data reaches 78+ (or October begins), live data wins automatically.
    var velocifyCheckpoint=(now.getFullYear()===2026&&now.getMonth()===9)?86:0;
    var meetingLeadsMTD=Math.max(leadsMTD,velocifyCheckpoint);
    var velocifyCheckpointNote=meetingLeadsMTD>leadsMTD
      ?('Latest Velocify tracker: '+meetingLeadsMTD+' leads MTD; '+leadsMTD+' individual lead records are currently synced, so the Top 10 referrer detail will catch up after the nightly Zapier refresh.')
      :('Velocify MTD is current through '+(monthLeads.reduce(function(latest,lead){var day=String(lead.date_added||'').slice(0,10);return day>latest?day:latest;},'')||'the latest sync')+'.');
    var dayOfMonth=Math.max(1,now.getDate());
    var daysInMonth=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
    var projectedMonthLeads=Math.round((meetingLeadsMTD/dayOfMonth)*daysInMonth);
    var ratioDenominator=powerBiActiveCount;
    var ratioMTD=ratioDenominator>0?(meetingLeadsMTD/ratioDenominator):0;
    var projectedRatio=ratioDenominator>0?(projectedMonthLeads/ratioDenominator):0;
    var ratioLabel=projectedRatio>=1.30?"Elite pace":projectedRatio>=1.15?"On-target pace":projectedRatio>=0.90?"Acceptable pace":"Below minimum pace";
    var ratioColor=projectedRatio>=1.15?"#3E8E5A":projectedRatio>=0.90?"#B8842B":"#B54B42";

    var migCtoB=migrations.filter(function(m){return m.from_tier==="C"&&m.to_tier==="B";}).length;
    var migBtoA=migrations.filter(function(m){return m.from_tier==="B"&&m.to_tier==="A";}).length;
    var migAtoChannel=migrations.filter(function(m){return m.from_tier==="A"&&m.to_tier==="Channel";}).length;
    var migOther=migrations.length-migCtoB-migBtoA-migAtoChannel;

    var healthCounts={Green:0,Yellow:0,Red:0};
    rows.forEach(function(r){healthCounts[r.health]++;});
    var top10AtRisk=rows.filter(function(r){return r.health==="Red";}).sort(function(a,b){
      return(b.daysSinceLead===null?9999:b.daysSinceLead)-(a.daysSinceLead===null?9999:a.daysSinceLead);
    }).slice(0,10);
    var PROACTIVE_WINDOW=7;
    var proactiveWatch=rows.filter(function(r){return r.health==="Green"&&r.daysUntilYellow!==null&&r.daysUntilYellow<=PROACTIVE_WINDOW&&r.watchReasons.length>0;})
      .sort(function(a,b){return a.daysUntilYellow-b.daysUntilYellow;});

    var growthPlanProfileByName={};
    currentPowerBiAgents.forEach(function(a){var k=String(a.agent_name||'').trim().toLowerCase().replace(/\s+/g,' ');if(k&&!growthPlanProfileByName[k])growthPlanProfileByName[k]=a;});
    var powerBiDetailRowsRaw=pbSource.detail&&pbSource.detail.by_agent?Object.values(pbSource.detail.by_agent).filter(function(a){return ['A','B','C'].includes(String(a.level||'').trim().toUpperCase());}):[];
    var growthPlanInvalidNameRows=powerBiDetailRowsRaw.filter(function(a){var name=String(a.name||'').trim();return !name||/^__Roster_delete_/i.test(name)||/^__Hidden__$/i.test(name);}).length;
    var powerBiDetailRows=powerBiDetailRowsRaw.filter(function(a){var name=String(a.name||'').trim();return !!name&&!ctExcludedFromActiveAgentRoster(name)&&!/^__Roster_delete_/i.test(name)&&!/^__Hidden__$/i.test(name);});
    var growthPlanRows=powerBiDetailRows.length?powerBiDetailRows.filter(function(a){return !ctExcludedFromActiveAgentRoster(a.name);}).map(function(a){
      var name=String(a.name||'').trim(),profile=growthPlanProfileByName[name.toLowerCase().replace(/\s+/g,' ')]||{},level=String(a.level||profile.powerbi_level||'').trim().toUpperCase();
      return Object.assign({},profile,{agent_name:name||profile.agent_name,powerbi_level:level,tier:profile.tier||(Number(a.closed_12mo||profile.closes_past_year||0)>=10?'Channel':level),next_growth_opportunity:profile.next_growth_opportunity||''});
    }):currentPowerBiAgents.filter(function(a){return !!String(a.powerbi_level||'').trim()&&!!String(a.agent_name||'').trim()&&!/^__Roster_delete_/i.test(String(a.agent_name||''));});
    var growthPlanTotal=Number(pbSource.profileTotal)||Number(pbSource.total)||growthPlanRows.length;
    var growthPlanUnlisted=Math.max(0,growthPlanTotal-growthPlanRows.length);
    var missingGrowthPlans=growthPlanRows.filter(function(a){return !String(a.next_growth_opportunity||'').trim();}).sort(function(a,b){var order={Channel:0,A:1,B:2,C:3},ta=order[a.tier]===undefined?4:order[a.tier],tb=order[b.tier]===undefined?4:order[b.tier];return ta-tb||pfrProperCase(a.agent_name).localeCompare(pfrProperCase(b.agent_name));});
    growthPlanRows=growthPlanRows.filter(function(a){return !/^__Roster_delete_/i.test(pfrProperCase(a.agent_name).trim());});
    missingGrowthPlans=missingGrowthPlans.filter(function(a){return !/^__Roster_delete_/i.test(pfrProperCase(a.agent_name).trim());});
    growthPlanUnlisted=Math.max(0,growthPlanTotal-growthPlanRows.length);
    var growthPlanMissingCount=missingGrowthPlans.length;
    var growthOppPct=growthPlanRows.length?Math.round(100*(growthPlanRows.length-growthPlanMissingCount)/growthPlanRows.length):0;
    var top10GrowthOpp=active.filter(function(a){return a.next_growth_opportunity;}).sort(function(a,b){
      var order={Channel:0,A:1,B:2,C:3};
      return(order[a.tier]!==undefined?order[a.tier]:4)-(order[b.tier]!==undefined?order[b.tier]:4);
    }).slice(0,10);

    // Satisfaction coverage follows the complete latest Power BI A/B/C population,
    // NOT the narrower 90-day managed relationships subset.
    var satisfactionPopulation=currentPowerBiAgents.filter(function(a){
      return ['A','B','C'].includes(String(a.powerbi_level||'').trim().toUpperCase());
    });
    var rated=satisfactionPopulation.map(function(a){
      var v=a.satisfaction_rating,n=Number(v);
      return {name:a.agent_name,tier:a.tier||a.powerbi_level,
        satisfaction:v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(n)&&n>=1&&n<=5?n:null};
    }).filter(function(a){return a.satisfaction!==null;});
    var avgSatisfaction=rated.length?(rated.reduce(function(sum,r){return sum+r.satisfaction;},0)/rated.length).toFixed(1):null;
    var lowSatisfaction=rated.filter(function(r){return r.satisfaction<=2;});
    var ratedCoverage=powerBiActiveCount?Math.round(rated.length/powerBiActiveCount*100):0;
    var satisfactionSyncGap=Math.max(0,powerBiActiveCount-satisfactionPopulation.length);
    var highPotential=active.filter(function(a){return a.high_potential_flag&&String(a.next_growth_opportunity||"").trim();});
    var highPotentialNeedsReason=active.filter(function(a){return a.high_potential_flag&&!String(a.next_growth_opportunity||"").trim();});

    // Meeting Cadence Compliance — Channel/A monthly, B every other month, HIGH-POTENTIAL C quarterly.
    // Lower-potential C partners are managed through campaigns/events/selective outreach and are not
    // penalized in this formal-meeting denominator.
    var meetingCadenceEligible=active.filter(function(a){return a.tier==="Channel"||a.tier==="A"||a.tier==="B"||(a.tier==="C"&&a.high_potential_flag);});
    var meetingCompliant=0;
    meetingCadenceEligible.forEach(function(a){
      var key=(a.agent_name||"").trim().toLowerCase();
      var last=lastMeeting[key];
      var daysSince=last?Math.round((now-new Date(last+"T12:00:00"))/86400000):null;
      var cadence=FORMAL_CADENCE[a.tier];
      if(daysSince!==null&&daysSince<=cadence)meetingCompliant++;
    });
    var meetingCompliancePct=meetingCadenceEligible.length>0?Math.round((meetingCompliant/meetingCadenceEligible.length)*100):0;

    // Themes — Service Recovery / Partner Feedback, split, parsed from [Theme: X] tag
    var themeCount={Recovery:{},Feedback:{}};
    periodActs.filter(function(a){return a.act_type==="Service Recovery"||a.act_type==="Partner Feedback";}).forEach(function(a){
      var m=(a.notes||"").match(/^\[Theme:\s*([^\]]+)\]/);
      var theme=m?m[1].trim():"Untagged";
      var bucket=a.act_type==="Service Recovery"?"Recovery":"Feedback";
      themeCount[bucket][theme]=(themeCount[bucket][theme]||0)+1;
    });

    var escalations=periodActs.filter(function(a){return a.outcome==="Needs manager attention";});

    pfrDrill={rows:rows,migrations:migrations,lowSatisfaction:lowSatisfaction,
      escalations:escalations,
      top10AtRisk:top10AtRisk,top10GrowthOpp:top10GrowthOpp,highPotential:highPotential,highPotentialNeedsReason:highPotentialNeedsReason,proactiveWatch:proactiveWatch,ratedPartners:rated,
      powerBiActiveRows:currentPowerBiAgents,
      rmActivePartners:rmActivePartners,
      managedActivePartners:active,
      monthLeads:monthLeads,
      leadsMTD:meetingLeadsMTD,
      projectedMonthLeads:projectedMonthLeads,
      ratioMTD:ratioMTD,
      projectedRatio:projectedRatio,
      totalActive:totalActive,
      powerBiActiveCount:powerBiActiveCount,
      ratioDenominator:ratioDenominator,
      pbSnapshot:pbSnapshot,
      pbSyncNote:pbSource.syncNote,
      pbSourceStamp:pbSource.stamp,
      powerBiLevelCounts:displayPbLevels,
      uploadedRows:uploadedRows};

    // Team leadership handoff: shared managed roster, dated Power BI population, and Velocify MTD.
    // Missing call history is a data gap, not evidence that a partner has been lost.
    var redRows=rows.filter(function(r){return r.health==="Red";});
    var redNoTouch=redRows.filter(function(r){return r.daysAny===null;}).length;
    var redWithTouch=redRows.length-redNoTouch;
    var missingNextMove=active.filter(function(a){return !String(a.next_growth_opportunity||"").trim();}).length;
    var milestone=ctCurrentRelationshipMilestone();
    var officialTier=await window.lpDanielTierPopulation();
    var officialCounts=pbSource.levels;
    var sourceDate=latestPowerBiStamp?new Date(latestPowerBiStamp).toLocaleDateString():"no current Power BI stamp";
    body.dataset.powerBiStamp=sourceDate;
    pfrDrill.tileDetails={
      'next:missing':{title:'Managed relationships without a documented next move',summary:missingNextMove+' of '+totalActive+' managed partners. Source: latest shared Power BI roster and agent profiles.',items:active.filter(function(a){return !String(a.next_growth_opportunity||'').trim();}).map(function(a){return{name:a.agent_name,detail:pfrTierLabel(a.tier)+' · next growth opportunity missing'};})},
      'pop:roster':{title:'Shared tracker roster',summary:'Current Power BI-stamped profiles excluding inactive relationships. This is distinct from the Power BI active Level count.',items:currentRosterRelationships.map(function(a){return{name:a.agent_name,detail:pfrTierLabel(a.tier)+' · '+(a.retained?'retained':'not marked retained')};})},
      'pb:closed':{title:'12-month Power BI closings',summary:pbSnapshot?'Aggregate: '+pbPipeline.closedTotal+' closings across '+pbPipeline.closedAgents+' agents in the '+fmt(pbSource.stamp)+' Power BI upload.':'Pipeline aggregate unavailable for the current Power BI upload.',emptyReason:'Agent-level records are unavailable from this Power BI summary. Open the current Power BI upload for individual closings.',items:[]},
      'growth:score':{title:'Tier Growth · score calculation',summary:'Channel '+officialCounts.Channel+'/'+milestone.Channel+' × 15 pts; A '+officialCounts.A+'/'+milestone.A+' × 15 pts; B '+officialCounts.B+'/'+milestone.B+' × 20 pts. Each component is capped at its point maximum. Select a tier tile to see its agents. Source: latest Power BI Level and 12-month closes.',emptyReason:'This is a calculation. Open Channel, A, or B for the available agent records.',items:[]}
    };
    ['Channel','A','B','C'].forEach(function(level){
      var matches=(officialTier.rows||[]).filter(function(a){return level==='Channel'?!!a._growth_channel:a._growth_level===level;});
      pfrDrill.tileDetails['growth:'+level]={title:level+' · scorecard partners',summary:matches.length+' partners in the latest managed Power BI population. Channel is a 10+ closing overlay and can also appear under A/B/C.',items:matches.map(function(a){return{name:a.agent_name,detail:'Power BI '+(a._growth_level||'no Level')+' · '+Number(a.closes_past_year||0)+' closings in 12 months'};})};
    });

    // Results use the completed month for the 30-point referral component; this month is a separate pace signal.
    var priorStart=new Date(now.getFullYear(),now.getMonth()-1,1).toISOString().slice(0,10);
    var monthStart=new Date(now.getFullYear(),now.getMonth(),1).toISOString().slice(0,10);
    var priorMonthLeads=allLeads.filter(function(l){var date=String(l.date_added||'').slice(0,10);return date>=priorStart&&date<monthStart;}).length;
    var priorLabel=new Date(now.getFullYear(),now.getMonth()-1,1).toLocaleDateString('en-US',{month:'long',year:'numeric'});
    var points=function(actual,target,weight){return target?Math.min(weight,Number(actual||0)/target*weight):0;};
    var tierPoints=points(officialCounts.Channel,milestone.Channel,15)+points(officialCounts.A,milestone.A,15)+points(officialCounts.B,milestone.B,20);
    var referralRatio=powerBiActiveCount?priorMonthLeads/powerBiActiveCount:0;
    var referralPoints=points(referralRatio,1.15,30);
    var activePoints=points(powerBiActiveCount,200,20);
    var nearTier=(officialTier.rows||[]).filter(function(a){
      var n=Number(a.closes_past_year||0),t=a._growth_level;
      return (t==='C'&&n===1)||(t==='B'&&n===3)||(t==='A'&&n===9);
    }).slice(0,10);
    var nearNames=nearTier.map(function(a){
      var name=String(a.agent_name||'').trim(), key=name.toLowerCase(), matchKey=ctAgentNameKey(name);
      var next=(a._growth_level==='C'?'B':a._growth_level==='B'?'A':'Channel');
      var pbRow=(pbSnapshot&&pbSnapshot.by_agent)?(pbSnapshot.by_agent[matchKey]||pbSnapshot.by_agent[key]||Object.values(pbSnapshot.by_agent).find(function(r){return ctAgentNameKey(r&&r.name||'')===matchKey;})):null;
      var preq=Number(pbRow&&pbRow.active_prequals||0), pipe=Number(pbRow&&pbRow.active_pipeline||0);
      var mtdRefs=monthLeads.filter(function(l){return (ctAgentNameKey(l.referral_partner_name||'')||String(l.referral_partner_name||'').trim().toLowerCase())===matchKey;}).length;
      var lastRM=lastSeenRM[key]||lastSeenRM[matchKey]||null, lastLP=lastSeenLP[key]||lastSeenLP[matchKey]||null;
      var lastTouch=[lastRM,lastLP].filter(Boolean).sort().pop()||null;
      var touchText=lastTouch?new Date(lastTouch+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}):'none in loaded history';
      var rm=(typeof agentRmOwners!=='undefined'&&(agentRmOwners[matchKey]||agentRmOwners[key]))||a.rm_owner||a.rm||'Unassigned';
      var lp=a.lp_owner||a.lp||'Unassigned';
      var opportunity='Get the next funded closing needed for '+next+'.';
      if(pipe>0)opportunity='Review '+pipe+' active pipeline buyer'+(pipe===1?'':'s')+' for the fastest path to the next closing.';
      else if(preq>0)opportunity='Move '+preq+' active prequal'+(preq===1?'':'s')+' toward contract and the next closing.';
      else if(mtdRefs>0)opportunity='Convert '+mtdRefs+' MTD referral'+(mtdRefs===1?'':'s')+' into the next closing.';
      else opportunity='No current buyer pipeline shown; create a specific referral or buyer opportunity.';
      return pfrProperCase(name)+' — '+a._growth_level+' → '+next+' | '+Number(a.closes_past_year||0)+' closes / 12 mo | 1 from '+next+' | '+mtdRefs+' referrals MTD | '+pipe+' active pipeline | '+preq+' preapproved/prequal | Opportunity: '+opportunity;
    });
    var referrerCounts={};
    monthLeads.forEach(function(lead){
      var name=String(lead.referral_partner_name||'').trim(),key=ctAgentNameKey(name)||name.toLowerCase();
      if(!key)return;
      if(!referrerCounts[key])referrerCounts[key]={name:name,count:0};
      referrerCounts[key].count++;
    });
    var topReferrers=Object.values(referrerCounts).sort(function(a,b){return b.count-a.count||a.name.localeCompare(b.name);}).slice(0,10);
    var latestLeadDate=monthLeads.reduce(function(latest,lead){var day=String(lead.date_added||'').slice(0,10);return day>latest?day:latest;},'');
    var riskNames=top10AtRisk.filter(function(row){return row.name&&row.name.indexOf('__')<0;}).slice(0,10).map(function(row){return pfrProperCase(row.name)+' — '+(row.daysSinceLead===null?'last lead date missing':row.daysSinceLead+' days since last lead')+(row.health?' · '+row.health:'');});
    var agenda=pfrBuildMeetingAgenda({tierPoints:tierPoints,channel:officialCounts.Channel,a:officialCounts.A,b:officialCounts.B,milestone:milestone,nearNames:nearNames,
      referralPoints:referralPoints,priorLabel:priorLabel,priorMonthLeads:priorMonthLeads,currentMonthLeads:meetingLeadsMTD,latestLeadDate:latestLeadDate,topReferrers:topReferrers,
      activeContracts:pbSnapshot?Number(pbPipeline.pipelineTotal||0):'Unavailable',preapprovedBuyers:pbSnapshot?Number(pbPipeline.prequalsTotal||0):'Unavailable',velocifyCheckpointNote:velocifyCheckpointNote,
      activePoints:activePoints,powerBiActiveCount:powerBiActiveCount,totalActive:totalActive,redCount:redRows.length,yellowCount:healthCounts.Yellow,redNoTouch:redNoTouch,
      missingNextMove:missingNextMove,riskNames:riskNames}).sections;
    var meetingExportData={date:localDateStr(now),source:'Power BI '+sourceDate+' · Velocify '+meetingLeadsMTD+' leads MTD'+(meetingLeadsMTD>leadsMTD?' (latest tracker checkpoint; individual rows pending nightly sync)':' through '+(latestLeadDate||'latest sync'))+' · tracker relationship history',score:(tierPoints+referralPoints+activePoints).toFixed(1)+' / 100',note:pbSource.syncNote||'',sections:agenda};
    var html=`<div class="lp-portfolio-meeting-brief" style="background:#F5FAFB;border:1px solid #B9D8E1;border-radius:12px;padding:18px;margin-bottom:14px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><div style="font-size:10px;font-weight:800;color:#35657C;letter-spacing:.09em">30-MINUTE TEAM PORTFOLIO MEETING</div><div style="font-size:19px;font-weight:800;color:#071B37;margin-top:3px">The results, the people, the decisions</div><div style="font-size:11px;color:#536B78;margin-top:4px">Power BI ${escHtml(sourceDate)} · Velocify ${meetingLeadsMTD} leads MTD${meetingLeadsMTD>leadsMTD?' · latest tracker checkpoint':' · through '+escHtml(latestLeadDate||'latest sync')} · tracker relationship history</div></div><button class="btn btn-sm" type="button" onclick="pfrExportMeetingBrief(this)">Download Word meeting record</button></div>
      ${pbSource.syncNote?'<p style="background:#fff7e7;padding:10px;border-radius:8px">'+escHtml(pbSource.syncNote)+'</p>':''}
      <div style="background:#fff;border:1px solid #DCE7EC;border-radius:10px;padding:13px;margin-top:14px"><b>Weighted result: ${(tierPoints+referralPoints+activePoints).toFixed(1)} / 100</b><div style="font-size:12px;color:#526575;margin-top:4px">Outcome measures: partner tiers /50 · completed-month referrals /30 · active partners /20. Activities guide the work; they do not add points by themselves.</div></div>
      ${agenda.map(function(section,i){return `<section style="background:#fff;border:1px solid #DCE7EC;border-radius:10px;padding:14px;margin-top:10px"><h3 style="font-size:14px;margin:0 0 6px">${i+1}. ${escHtml(section.title)} <span style="font-weight:400;color:#536B78">· ${section.minutes} min</span></h3>${section.result?'<div style="font-weight:700;font-size:12px">'+escHtml(section.result)+'</div>':''}<p style="font-size:12px;line-height:1.5;margin:7px 0">${escHtml(section.context)}</p>${section.people.length?`<div style="font-size:11px;font-weight:700;margin:10px 0 4px">Partners to review</div><ul style="margin:0 0 9px;padding-left:19px;font-size:12px;line-height:1.65">${section.people.map(function(person){return `<li>${escHtml(person)}</li>`;}).join('')}</ul>`:''}${section.talkingPoints.length?`<div style="font-size:11px;font-weight:700;margin:8px 0 4px">Talk through</div><ol style="margin:0 0 9px;padding-left:19px;font-size:12px;line-height:1.65">${section.talkingPoints.map(function(point){return `<li>${escHtml(point)}</li>`;}).join('')}</ol>`:''}<p style="font-size:12px;line-height:1.5;margin:6px 0"><b>Decide:</b> ${escHtml(section.question)}</p><label style="display:block;font-size:11px;font-weight:700;margin-top:9px">Decision · owner · due date</label><textarea data-portfolio-decision="${section.key}" oninput="pfrSaveMeetingDecisions()" rows="2" placeholder="Record the action, owner and due date" style="display:block;width:100%;box-sizing:border-box;border:1px solid #CBD8E3;border-radius:8px;padding:9px;font:inherit;margin-top:4px"></textarea></section>`;}).join('')}
      <p style="font-size:11px;color:#526575;margin-bottom:0">Decisions save in this browser. Download the Word document after the meeting to share the completed handoff.</p>
    </div>`;

    html+='<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:14px">'
      +'<div style="font-size:13px;font-weight:700;margin-bottom:4px">Power BI → Tracker Reconciliation</div>'
      +'<div style="font-size:11px;color:var(--text-3);margin-bottom:10px">Management total is the Power BI Active Agent count: every uploaded row with an A, B, or C Level. Tracker-managed relationships are shown separately.</div>'
      +'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">'
        +pfrStatTile("Power BI Active Agents",powerBiActiveCount,"pfrOpenDrill('pb:levels')")
        +pfrStatTile("Raw Power BI rows",uploadedRows,"pfrOpenDrill('pop:powerbi')")
        +pfrStatTile("Shared tracker roster",currentRosterRelationships.length,"pfrOpenDrill(\'pop:roster\')")
        +pfrStatTile("Managed 90-day relationships",totalActive,"pfrOpenDrill('tier:all')")
      +'</div>'
      +'<div style="font-size:10.5px;color:var(--text-3);margin-top:8px"><strong>'+powerBiActiveCount+' Power BI Active Agents</strong> = '+Number(displayPbLevels.A||0)+' A + '+Number(displayPbLevels.B||0)+' B + '+Number(displayPbLevels.C||0)+' C. '+(uploadedRows==='Unavailable'?'Raw spreadsheet row count is unavailable from the current shared source.':'The file contains '+uploadedRows+' raw rows; '+powerBiNoLevelCount+' row'+(powerBiNoLevelCount===1?' has':'s have')+' no A/B/C Level.')+' Separately, the tracker has '+currentRosterRelationships.length+' shared roster relationships, '+rmActivePartners.length+' meet the 90-day lead/close rule, and '+dncActiveCount+' active DNC relationship'+(dncActiveCount===1?' is':'s are')+' excluded, leaving '+totalActive+' managed 90-day relationships.'+(pbSource.syncNote?' Relationship totals are partial until profile sync completes.':'')+'</div>'
    +'</div>';

    html+='<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:14px">'
      +'<div style="font-size:13px;font-weight:700;margin-bottom:3px">Pipeline Signals from Power BI</div>'
      +'<div style="font-size:10.5px;color:var(--text-3);margin-bottom:10px">Useful production context without adding another tier scoreboard.</div>'
      +'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">'
        +pfrStatTile("Active Prequals",pbSnapshot?pbPipeline.prequalsTotal+(pbPipeline.prequalsAgents?' · '+pbPipeline.prequalsAgents+' agents':''):'Unavailable',"pfrOpenDrill('pb:prequals')")
        +pfrStatTile("Active In Pipeline",pbSnapshot?pbPipeline.pipelineTotal+(pbPipeline.pipelineAgents?' · '+pbPipeline.pipelineAgents+' agents':''):'Unavailable',"pfrOpenDrill('pb:pipeline')")
        +pfrStatTile("12mo Closings",pbSnapshot?pbPipeline.closedTotal+(pbPipeline.closedAgents?' · '+pbPipeline.closedAgents+' agents':''):'Unavailable',"pfrOpenDrill(\'pb:closed\')")
      +'</div>'
      +'<div style="font-size:10.5px;color:var(--text-3);margin-top:8px">Raw totals from the latest Power BI upload. These are portfolio context, not an LP workload target.</div>'
    +'</div>';

    html+='<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:14px">'
      +'<div style="font-size:13px;font-weight:700;margin-bottom:4px">Power BI Agent Levels</div><div style="font-size:10.5px;color:var(--text-3);margin-bottom:10px">The Power BI A/B/C population is the scorecard source of truth. Managed 90-day relationships use a separate activity rule and must not replace the active-agent total. Channel is a subset of A, not an additional Power BI level.</div>'
      +'<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">'
        +pfrTile("Power BI Active",powerBiActiveCount,null,"pfrOpenDrill(\'pop:powerbi\')")
        +pfrTile("A (incl. Channel)",Number(displayPbLevels.A||0),null,"pfrOpenDrill(\'pb:levels\')")
        +pfrTile("B",Number(displayPbLevels.B||0),null,"pfrOpenDrill(\'pb:levels\')")
        +pfrTile("C",Number(displayPbLevels.C||0),null,"pfrOpenDrill(\'pb:levels\')")
        +pfrTile("No Power BI Level",powerBiNoLevelCount,null,"pfrOpenDrill(\'pb:levels\')")
        +pfrTile("Managed 90d",totalActive,null,"pfrOpenDrill(\'tier:all\')")
      +'</div>'
      +'<div style="font-size:10.5px;color:var(--text-3);margin-top:8px">Power BI Active = A + B + C ('+powerBiActiveCount+' agents). Managed 90d is a smaller follow-up group ('+totalActive+' relationships), not a replacement denominator. Both figures update from their respective sources.</div>'
    +'</div>';

    html+='<div onclick="pfrOpenDrill(\'ratio\')" style="cursor:pointer;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:14px">'
      +'<div style="font-size:13px;font-weight:700;margin-bottom:6px">Active Agent-to-Lead Ratio · Monthly <span style="font-size:10px;font-weight:600;color:var(--text-3)">· click for source data</span></div>'
      +'<div style="font-size:11.5px;color:var(--text-3);margin-bottom:8px">'+meetingLeadsMTD+' Velocify leads MTD &divide; '+ratioDenominator+' Power BI Active Agents = <strong>'+ratioMTD.toFixed(2)+'</strong></div>'
      +'<div style="font-size:24px;font-weight:800;color:'+ratioColor+'">'+projectedRatio.toFixed(2)+'<span style="font-size:13px;font-weight:600;margin-left:8px">'+ratioLabel+'</span></div>'
      +'<div style="font-size:10.5px;color:var(--text-3);margin-top:2px">Projected month-end pace: '+projectedMonthLeads+' leads. Min 0.90 &middot; Target 1.15+ &middot; Elite 1.30+</div>'
    +'</div>';

    html+='<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:14px">'
      +'<div style="font-size:13px;font-weight:700;margin-bottom:10px">Tier Migration Progress &mdash; '+range.label+'</div>'
      +'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">'
        +pfrTile("C &rarr; B",migCtoB,null,"pfrOpenDrill(\'mig:C:B\')")
        +pfrTile("B &rarr; A",migBtoA,null,"pfrOpenDrill(\'mig:B:A\')")
        +pfrTile("A &rarr; Channel",migAtoChannel,null,"pfrOpenDrill(\'mig:A:Channel\')")
        +pfrTile("Other",migOther,null,"pfrOpenDrill(\'mig:other\')")
      +'</div>'
    +'</div>';

    html+='<div style="background:var(--surface);border:1px solid #1F4E79;border-radius:12px;padding:16px;margin-bottom:14px">'
      +'<div style="font-size:13px;font-weight:700;margin-bottom:4px">Proactive Watch &mdash; reach out before they go Yellow</div>'
      +'<div style="font-size:11px;color:var(--text-3);margin-bottom:8px">Green partners approaching a referral or meaningful-contact deadline within 7 days. Reasons and actions appear below.</div>'
      +(proactiveWatch.length?proactiveWatch.map(function(r,i){return pfrListRow(i+1,pfrProperCase(r.name),escHtml(pfrTierLabel(r.tier))+" &middot; "+r.daysUntilYellow+" days to Yellow<br>"+r.watchReasons.map(escHtml).join("<br>")+"<br><b>Next:</b> "+escHtml(r.watchAction));}).join(""):'<div style="text-align:center;color:var(--text-3);font-size:12px;padding:8px 0">Nobody\'s close to slipping right now.</div>')
    +'</div>';

    html+='<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:14px">'
      +'<div style="font-size:13px;font-weight:700;margin-bottom:10px">Partner Health</div>'
      +'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px">'
        +pfrHealthTile("Green",healthCounts.Green,"#3E8E5A","pfrOpenDrill(\'health:Green\')")
        +pfrHealthTile("Yellow",healthCounts.Yellow,"#B8842B","pfrOpenDrill(\'health:Yellow\')")
        +pfrHealthTile("Red",healthCounts.Red,"#B54B42","pfrOpenDrill(\'health:Red\')")
      +'</div>'
      +(top10AtRisk.length?'<div style="border-top:1px solid var(--border-light);padding-top:8px"><div style="font-size:10.5px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;padding:0 4px">Top Red &mdash; ranked by days since last lead</div>'
        +top10AtRisk.map(function(r,i){return pfrListRow(i+1,pfrProperCase(r.name),pfrTierLabel(r.tier)+" &middot; "+(r.daysSinceLead===null?"no lead logged":r.daysSinceLead+"d since last lead")+(r.recovery_plan?" &middot; recovery plan on file":" &middot; &#9888; no recovery plan"));}).join("")+'</div>'
        :'<div style="text-align:center;color:var(--text-3);font-size:12px;padding:8px 0">No Red partners right now.</div>')
    +'</div>';

    html+='<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:14px">'
      +'<div style="font-size:13px;font-weight:700;margin-bottom:6px">Recorded Partner Satisfaction — Small Sample</div>'
      +(avgSatisfaction?'<div style="font-size:24px;font-weight:800;color:'+(avgSatisfaction>=4?"#3E8E5A":avgSatisfaction>=3?"#B8842B":"#B54B42")+'">'+avgSatisfaction+'<span style="font-size:13px;font-weight:600;color:var(--text-3)"> / 5 avg</span></div><div style="font-size:10.5px;color:var(--text-3);margin-top:2px">'+rated.length+' of '+powerBiActiveCount+' Power BI active agents rated ('+ratedCoverage+'% coverage)</div><div style="font-size:11px;color:var(--text-3);margin-top:7px">Average of recorded 1–5 scores from Power BI active agents only. Unrated agents are excluded from the average. '+(satisfactionSyncGap?'Agent profile sync incomplete for '+satisfactionSyncGap+' active agents. ':'')+(rated.length<10?'Fewer than 10 ratings; do not treat this as a representative satisfaction score.':'Interpret cautiously when response coverage is low.')+'</div><button type="button" onclick="pfrOpenDrill(\'satisfaction\')" style="cursor:pointer;margin-top:8px;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:7px 10px;font-size:11px;font-weight:700">See the '+rated.length+' individual ratings</button>'
        :'<div style="text-align:center;color:var(--text-3);font-size:12px;padding:6px 0">No satisfaction ratings set yet.</div>')
      +(lowSatisfaction.length?'<div onclick="pfrOpenDrill(\'lowsat\')" style="cursor:pointer;margin-top:10px;background:#FBF3F3;border:1px solid #F0AFAF;border-radius:8px;padding:10px 12px;font-size:12px;color:#B54B42;font-weight:600">&#9888; '+lowSatisfaction.length+' partner'+(lowSatisfaction.length!==1?"s":"")+' rated 1&ndash;2. Click to view &rarr;</div>':'')
    +'</div>';

    html+='<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:14px">'
      +'<div style="font-size:13px;font-weight:700;margin-bottom:10px">High-Potential Partners — Documented Opportunities</div>'
      +'<div style="font-size:11px;color:var(--text-3);margin-bottom:8px">Manually flagged, not automatically scored. A recorded growth opportunity is required to be actionable.</div>'
      +(highPotential.length?highPotential.map(function(a,i){return pfrListRow(i+1,pfrProperCase(a.agent_name),escHtml(pfrTierLabel(a.tier))+" &middot; <b>Reason recorded:</b> "+escHtml(String(a.next_growth_opportunity).trim())+"<br><b>Next:</b> Validate and schedule a growth conversation.");}).join(""):'<div style="text-align:center;color:var(--text-3);font-size:12px;padding:8px 0">None with a documented opportunity.</div>')+(highPotentialNeedsReason.length?'<div style="font-size:12px;margin-top:10px"><b>Needs qualification ('+highPotentialNeedsReason.length+'):</b> Flag set without a reason; not verified.</div>'+highPotentialNeedsReason.map(function(a){return pfrListRow(null,pfrProperCase(a.agent_name),escHtml(pfrTierLabel(a.tier))+' &middot; Missing documented reason.<br><b>Next:</b> Document the opportunity or remove the flag.');}).join(''):'')
    +'</div>';

    html+='<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:14px">'
      +'<div style="font-size:13px;font-weight:700;margin-bottom:6px">Growth Plans</div>'
      +'<div style="font-size:11.5px;color:var(--text-3);margin-bottom:8px">'+growthOppPct+'% of reviewed profiles have a documented next growth opportunity</div>'
      +'<div style="font-size:11px;color:var(--text-2);margin-bottom:8px">'+growthPlanMissingCount+' of '+growthPlanTotal+' Power BI active agents are missing a documented growth plan</div>'
      +(missingGrowthPlans.filter(function(a){return !!String(a.agent_name||'').trim()&&!/^__Roster_delete_/i.test(String(a.agent_name||''));}).length?'<div style="max-height:360px;overflow:auto;border-top:1px solid var(--border-light)">'+missingGrowthPlans.filter(function(a){return !!String(a.agent_name||'').trim()&&!/^__Roster_delete_/i.test(String(a.agent_name||''));}).map(function(a){return pfrListRow(null,a.agent_name,escHtml(pfrTierLabel(a.tier))+' · No next growth opportunity documented');}).join('')+'</div>':'<div style="text-align:center;color:var(--text-3);font-size:12px;padding:8px 0">All named Power BI active agents have a documented next growth opportunity.</div>')+(growthPlanUnlisted?'<div style="font-size:11px;margin-top:8px">'+growthPlanUnlisted+' active roster entries lack a matched profile. Plan status is unknown.</div>':'')
    +'</div>';

    html+='<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:14px">'
      +'<div style="font-size:13px;font-weight:700;margin-bottom:6px">Meeting Cadence Compliance</div>'
      +'<div style="font-size:11px;color:var(--text-3);margin-bottom:8px">Formal meetings (Partner Meeting or Break Bread) against each tier\'s cadence &mdash; Channel/A monthly, B every-other-month, high-potential C quarterly. Distinct from touch cadence above.</div>'
      +'<div style="font-size:24px;font-weight:800;color:'+(meetingCompliancePct>=80?"#3E8E5A":meetingCompliancePct>=50?"#B8842B":"#B54B42")+'">'+meetingCompliancePct+'%</div>'
      +'<div style="font-size:10.5px;color:var(--text-3);margin-top:2px">'+meetingCompliant+' of '+meetingCadenceEligible.length+' partners who require formal cadence current</div>'
    +'</div>';

    html+='<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:14px">'
      +'<div style="font-size:13px;font-weight:700;margin-bottom:10px">Top 10 Growth Opportunities</div>'
      +(top10GrowthOpp.length?top10GrowthOpp.map(function(a,i){return pfrListRow(i+1,pfrProperCase(a.agent_name),pfrTierLabel(a.tier)+" &middot; "+escHtml(a.next_growth_opportunity));}).join(""):'<div style="text-align:center;color:var(--text-3);font-size:12px;padding:8px 0">No growth opportunities documented yet.</div>')
    +'</div>';

    html+='<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:14px">'
      +'<div style="font-size:13px;font-weight:700;margin-bottom:10px">Service Recovery Themes</div>'
      +(Object.keys(themeCount.Recovery).length?'<div style="display:flex;flex-wrap:wrap;gap:8px">'+Object.keys(themeCount.Recovery).sort(function(a,b){return themeCount.Recovery[b]-themeCount.Recovery[a];}).map(function(t){return'<span style="background:var(--surface-2);border-radius:20px;padding:6px 12px;font-size:12px;font-weight:600;color:var(--text-2)">'+escHtml(t)+' &middot; '+themeCount.Recovery[t]+'</span>';}).join("")+'</div>'
        :'<div style="text-align:center;color:var(--text-3);font-size:12px;padding:8px 0">No Service Recovery logged this period.</div>')
    +'</div>';

    html+='<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:14px">'
      +'<div style="font-size:13px;font-weight:700;margin-bottom:10px">Partner Feedback Themes</div>'
      +(Object.keys(themeCount.Feedback).length?'<div style="display:flex;flex-wrap:wrap;gap:8px">'+Object.keys(themeCount.Feedback).sort(function(a,b){return themeCount.Feedback[b]-themeCount.Feedback[a];}).map(function(t){return'<span style="background:var(--surface-2);border-radius:20px;padding:6px 12px;font-size:12px;font-weight:600;color:var(--text-2)">'+escHtml(t)+' &middot; '+themeCount.Feedback[t]+'</span>';}).join("")+'</div>'
        :'<div style="text-align:center;color:var(--text-3);font-size:12px;padding:8px 0">No Partner Feedback logged this period.</div>')
    +'</div>';

    html+='<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:14px">'
      +'<div style="font-size:13px;font-weight:700;margin-bottom:10px">Required Leadership Escalations</div>'
      +(escalations.length?escalations.map(function(e){return pfrListRow(null,pfrProperCase(e.agent_name),escHtml((e.notes||"").substring(0,120)));}).join(""):'<div style="text-align:center;color:var(--text-3);font-size:12px;padding:8px 0">Nothing escalated this period.</div>')
    +'</div>';

    

    body.innerHTML=html;
    pfrCompactOverview(body,{
      'Meeting brief':agenda.length+' agenda items · 30 minutes',
      'Power BI reconciliation':powerBiActiveCount+' active agents',
      'Pipeline signals':pbSnapshot?pbPipeline.pipelineTotal+' in pipeline · '+pbPipeline.prequalsTotal+' active prequals':'Pipeline data unavailable',
      'Power BI agent tiers':powerBiActiveCount+' active agents · '+totalActive+' managed 90d',
      'Referral pace':meetingLeadsMTD+' partner referrals MTD',
      'Tier movement':(migCtoB+migBtoA+migAtoChannel+migOther)+' changes · '+range.label,
      'Proactive watch':proactiveWatch.length+' partners on watch',
      'Partner satisfaction':rated.length?avgSatisfaction+' / 5 · '+rated.length+'/'+powerBiActiveCount+' active agents rated':'0 of '+powerBiActiveCount+' active agents rated',
      'High-potential partners':highPotential.length+' documented · '+highPotentialNeedsReason.length+' needs reason',
      'Growth plans':growthPlanTotal?growthPlanMissingCount+' of '+growthPlanTotal+' missing a plan':'No active roster available',
      'Meeting cadence':meetingCadenceEligible.length?(meetingCadenceEligible.length-meetingCompliant)+' of '+meetingCadenceEligible.length+' due':'No partners on cadence',
      'Growth next steps':top10GrowthOpp.length+' opportunities listed',
      'Service recovery':periodActs.filter(function(a){return a.act_type==='Service Recovery'}).length+' logged · '+range.label,
      'Partner feedback':periodActs.filter(function(a){return a.act_type==='Partner Feedback'}).length+' logged · '+range.label,
      'Leadership escalations':escalations.length+' flagged · '+range.label
    });
    body._portfolioCards[0]._portfolioExportData=meetingExportData;
    pfrRestoreMeetingDecisions(body._portfolioCards[0]);
  }catch(e){
    console.warn("Portfolio review load failed:",e);
    body.innerHTML='<div style="text-align:center;padding:32px;color:var(--text-3);font-size:13px">Could not load &mdash; check connection. ('+e.message+')</div>';
  }
}
window.pfrLoad=pfrLoad;
window.pfrGetHealthRows=function(){return Array.isArray(pfrDrill.rows)?pfrDrill.rows:null;};
function pfrCompactOverview(body,summaries){
  var cards=Array.from(body.children);if(!cards.length)return;
  var titles=[
    {label:'Power BI reconciliation',find:'Power BI → Tracker Reconciliation',group:'numbers'},
    {label:'Pipeline signals',find:'Pipeline Signals from Power BI',group:'numbers'},
    {label:'Power BI agent tiers',find:'Power BI Agent Levels',group:'numbers'},
    {label:'Referral pace',find:'Active Agent-to-Lead Ratio',group:'numbers'},
    {label:'Tier movement',find:'Tier Migration Progress',group:'numbers'},
    {label:'Proactive watch',find:'Proactive Watch',group:'relationships'},
    {label:'Partner health',find:'Partner Health',group:'relationships'},
    {label:'Partner satisfaction',find:'Partner Satisfaction',group:'relationships'},
    {label:'High-potential partners',find:'High-Potential Agents',group:'relationships'},
    {label:'Growth plans',find:'Growth Plans',group:'relationships'},
    {label:'Meeting cadence',find:'Meeting Cadence Compliance',group:'relationships'},
    {label:'Growth next steps',find:'Top 10 Growth Opportunities',group:'activity'},
    {label:'Service recovery',find:'Service Recovery Themes',group:'activity'},
    {label:'Partner feedback',find:'Partner Feedback Themes',group:'activity'},
    {label:'Leadership escalations',find:'Required Leadership Escalations',group:'activity'}
  ];
  var nav=document.createElement('div');nav.className='pfr-overview';
  var groups={};
  [['Start here','Meeting preparation'],['numbers','Portfolio performance'],['relationships','Partner follow-up'],['activity','Actions and feedback']].forEach(function(pair){
    var section=document.createElement('section'), title=document.createElement('h3'), grid=document.createElement('div');
    title.textContent=pair[1];grid.className='pfr-overview-grid';
    section.append(title,grid);nav.append(section);groups[pair[0]]=grid;
  });
  var detail=document.createElement('section');detail.className='lp-portfolio-active-detail';
  cards.forEach(function(card,i){
    var heading=(card.firstElementChild&&card.firstElementChild.textContent||'').trim();
    var entry=i===0?{label:'Meeting brief',group:'Start here'}:titles.find(function(t){return heading.indexOf(t.find)===0;})||{label:heading.slice(0,50)||'More detail',group:'activity'};
    // v90: Health scoring is temporarily removed from Portfolio until its source logic is rebuilt.
    if(entry.label==='Partner health'){ card.style.display='none'; return; }
    var tile=document.createElement('button');tile.type='button';tile.className='lp-portfolio-topic-tile';tile.dataset.portfolioTopic=String(i);tile.setAttribute('aria-expanded','false');
    var label=document.createElement('strong'),metric=document.createElement('span'),arrow=document.createElement('span');
    label.textContent=entry.label;metric.textContent=summaries[entry.label]||'View details';arrow.textContent='›';arrow.setAttribute('aria-hidden','true');arrow.className='pfr-arrow';
    tile.append(label,metric,arrow);groups[entry.group].append(tile);
    card.querySelectorAll('[onclick]').forEach(function(control){
      if(control.matches('a,button,[role="button"]'))return;
      control.setAttribute('role','button');control.setAttribute('tabindex','0');
    });
  });
  body.replaceChildren(nav);
  body._portfolioCards=cards;
  body._portfolioDetail=detail;
  if(!body.dataset.portfolioNavInstalled){
    body.addEventListener('click',function(ev){
      var tile=ev.target.closest('[data-portfolio-topic]');if(!tile||!body.contains(tile))return;
      var card=body._portfolioCards[Number(tile.dataset.portfolioTopic)];if(!card)return;
      if(tile.classList.contains('active')){
        body._portfolioDetail.remove();tile.classList.remove('active');tile.setAttribute('aria-expanded','false');return;
      }
      body._portfolioDetail.replaceChildren(card);
      tile.after(body._portfolioDetail);
      body.querySelectorAll('[data-portfolio-topic]').forEach(function(b){b.classList.toggle('active',b===tile);b.setAttribute('aria-expanded',b===tile?'true':'false');});
    });
    body.dataset.portfolioNavInstalled='1';
  }
  // A closed initial state makes the first click visibly open the meeting outline.
}
document.addEventListener('keydown',function(event){
  if((event.key==='Enter'||event.key===' ')&&event.target.matches('#pfr-body [role="button"][onclick]')){event.preventDefault();event.target.click();}
});
function pfrMeetingDecisionFields(){
  var body=document.getElementById('pfr-body');
  return body&&body._portfolioCards&&body._portfolioCards[0]?body._portfolioCards[0].querySelectorAll('[data-portfolio-decision]'):[];
}
function pfrMeetingStorageKey(){return 'ct_portfolio_meeting_decisions_'+new Date().toLocaleDateString('en-CA');}
function pfrSaveMeetingDecisions(){
  var values={};pfrMeetingDecisionFields().forEach(function(field){values[field.dataset.portfolioDecision]=field.value;});
  try{localStorage.setItem(pfrMeetingStorageKey(),JSON.stringify(values));}catch(err){console.warn('Could not save meeting decisions locally',err);}
}
function pfrRestoreMeetingDecisions(card){
  if(!card)return;
  try{
    var saved=JSON.parse(localStorage.getItem(pfrMeetingStorageKey())||'{}');
    card.querySelectorAll('[data-portfolio-decision]').forEach(function(field){field.value=saved[field.dataset.portfolioDecision]||'';});
  }catch(err){console.warn('Could not restore meeting decisions',err);}
}
window.pfrSaveMeetingDecisions=pfrSaveMeetingDecisions;
async function pfrExportMeetingBrief(button){
  var card=button&&button.closest('.lp-portfolio-meeting-brief');
  var data=card&&card._portfolioExportData;
  if(!data||!Array.isArray(data.sections)){alert('This meeting agenda is still loading. Please wait for its results to appear and try again.');return;}
  if(typeof JSZip!=='function'){alert('Word export is unavailable. Reload this tracker and try again.');return;}
  var xml=function(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c];});};
  var p=function(value,style,keepWithNext){
    var runs=String(value==null?'':value).split(/\r?\n/).map(function(line,i){return (i?'<w:br/>':'')+'<w:t xml:space="preserve">'+xml(line)+'</w:t>';}).join('');
    return '<w:p><w:pPr><w:pStyle w:val="'+style+'"/>'+(keepWithNext?'<w:keepNext/>':'')+'</w:pPr><w:r>'+runs+'</w:r></w:p>';
  };
  var decisions={};card.querySelectorAll('[data-portfolio-decision]').forEach(function(field){decisions[field.dataset.portfolioDecision]=field.value.trim();});
  var decisionCount=Object.keys(decisions).filter(function(key){return !!decisions[key];}).length;
  var paragraphs=p('30-minute Team Portfolio Meeting','Title')+p('Results, partners and decisions  |  '+data.date,'Subtitle')
    +p('Select up to three partner actions, assign owners and due dates, and set the next review.','Body')
    +p(data.score,'Score')+p(data.source,'Note')
    +p('Decisions recorded: '+decisionCount+' of '+data.sections.length+'. '+(decisionCount<data.sections.length?'Complete the open decisions before sharing this meeting record.':'Review owners and due dates before sharing.'),'Note')
    +(data.note?p('Data to verify: '+data.note,'Warning'):'');
  data.sections.forEach(function(section,i){
    paragraphs+=p((i+1)+'. '+section.title+'  |  '+section.minutes+' minutes','Heading1');
    if(section.result)paragraphs+=p(section.result,'Result',true);
    if(section.context)paragraphs+=p(section.context,'Body',true);
    if(section.people&&section.people.length){paragraphs+=p('PARTNERS TO REVIEW','Eyebrow',true);section.people.forEach(function(person){paragraphs+=p('•  '+person,'Body',true);});}
    if(section.talkingPoints&&section.talkingPoints.length){paragraphs+=p('TALK THROUGH','Eyebrow',true);section.talkingPoints.forEach(function(point,index){paragraphs+=p((index+1)+'.  '+point,'Body',true);});}
    if(section.question&&section.key!=='review')paragraphs+=p('DECIDE  '+section.question,'Prompt',true);
    paragraphs+=p('ACTION  ·  OWNER  ·  DUE DATE','Eyebrow',true)+p(decisions[section.key]||'No decision recorded.','Decision');
  });
  var word='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    +paragraphs+'<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="800" w:right="1050" w:bottom="800" w:left="1050" w:header="450" w:footer="450"/></w:sectPr></w:body></w:document>';
  var styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    +'<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="20"/><w:color w:val="26374A"/></w:rPr><w:pPr><w:spacing w:after="80" w:line="260" w:lineRule="auto"/></w:pPr></w:style>'
    +'<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="171C23"/></w:rPr></w:style>'
    +'<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="130"/></w:pPr><w:rPr><w:sz w:val="19"/><w:color w:val="50677D"/></w:rPr></w:style>'
    +'<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="170" w:after="55"/><w:shd w:fill="EAF3F8"/><w:ind w:left="140"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/><w:color w:val="173958"/></w:rPr></w:style>'
    +'<w:style w:type="paragraph" w:styleId="Body"><w:name w:val="Body"/><w:basedOn w:val="Normal"/></w:style>'
    +'<w:style w:type="paragraph" w:styleId="Eyebrow"><w:name w:val="Eyebrow"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="80" w:after="25"/><w:keepNext/></w:pPr><w:rPr><w:b/><w:sz w:val="17"/><w:color w:val="247798"/></w:rPr></w:style>'
    +'<w:style w:type="paragraph" w:styleId="Score"><w:name w:val="Score"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="55"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="173958"/></w:rPr></w:style>'
    +'<w:style w:type="paragraph" w:styleId="Result"><w:name w:val="Result"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:after="55"/></w:pPr><w:rPr><w:b/><w:sz w:val="21"/><w:color w:val="173958"/></w:rPr></w:style>'
    +'<w:style w:type="paragraph" w:styleId="Prompt"><w:name w:val="Prompt"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="50" w:after="65"/></w:pPr><w:rPr><w:i/><w:color w:val="39546B"/></w:rPr></w:style>'
    +'<w:style w:type="paragraph" w:styleId="Decision"><w:name w:val="Decision"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="100"/><w:shd w:fill="F3F8F7"/><w:ind w:left="140"/></w:pPr><w:rPr><w:color w:val="214539"/></w:rPr></w:style>'
    +'<w:style w:type="paragraph" w:styleId="Note"><w:name w:val="Note"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="18"/><w:color w:val="66798A"/></w:rPr></w:style>'
    +'<w:style w:type="paragraph" w:styleId="Warning"><w:name w:val="Warning"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="18"/><w:color w:val="8C631F"/></w:rPr></w:style>'
    +'</w:styles>';
  try{
    var zip=new JSZip();
    zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
    zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/_rels/document.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    zip.file('word/document.xml',word);zip.file('word/styles.xml',styles);
    var blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});
    var url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='Team-Portfolio-Meeting-'+data.date+'.docx';
    document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url);},60000);
    if(button){var label=button.textContent;button.textContent='Word document downloaded';setTimeout(function(){button.textContent=label;},2500);}
  }catch(err){console.error('Meeting agenda export failed',err);alert('Could not create the Word agenda. Please try again.');}
}
window.pfrExportMeetingBrief=pfrExportMeetingBrief;

function pfrOpenDrill(key){
  var overlay=document.getElementById("pfr-drilldown-overlay");
  var title=document.getElementById("pfr-drilldown-title");
  var body=document.getElementById("pfr-drilldown-body");
  if(!overlay||!title||!body)return;
  var items=[];
  var detail=pfrDrill.tileDetails&&pfrDrill.tileDetails[key];
  if(detail){
    title.textContent=detail.title;
    var summary=detail.summary?'<div style="padding:12px 16px;background:var(--surface-2);font-size:12px;line-height:1.55">'+escHtml(detail.summary)+'</div>':'';
    body.innerHTML=summary+(detail.items.length?detail.items.map(function(it,i){return pfrListRow(i+1,it.name,it.detail);}).join(''):'<div style="padding:18px;color:var(--text-3);font-size:12px">'+escHtml(detail.emptyReason||'No activity logged for the selected period.')+'</div>');
    overlay.style.display='flex';return;
  }
  if(key==="satisfaction"){
    title.textContent="Recorded Partner Satisfaction — Respondents";
    var respondents=(pfrDrill.ratedPartners||[]).slice().sort(function(a,b){return String(a.name).localeCompare(String(b.name));});
    var allPowerBi=pfrDrill.powerBiActiveCount||0;
    body.innerHTML='<div style="padding:12px 16px;background:var(--surface-2);font-size:12px;line-height:1.6"><b>'+respondents.length+'</b> of <b>'+allPowerBi+'</b> Power BI active agents have a valid 1–5 rating. This is a limited sample, not a verified survey of the full population. Ratings come from agent profile records; dates and survey methodology are not currently tracked.</div>'+respondents.map(function(r,i){return pfrListRow(i+1,r.name,escHtml(pfrTierLabel(r.tier))+' · recorded rating: '+r.satisfaction+' / 5');}).join('');
    overlay.style.display='flex';return;
  }else if(key==="lowsat"){
    title.textContent="Low Satisfaction / Support Rating";
    items=(pfrDrill.lowSatisfaction||[]).map(function(r){return{name:r.name,detail:pfrTierLabel(r.tier)+" · rated "+r.satisfaction+"/5"};});
  }else if(key==="ratio"){
    title.textContent="Agent-to-Lead Ratio — source data";
    var mtd=pfrDrill.monthLeads||[];
    var summary='<div style="padding:12px 16px;background:var(--surface-2);border-bottom:1px solid var(--border);font-size:12px;line-height:1.6">'
      +'<strong>'+((pfrDrill.leadsMTD||0))+' Velocify leads MTD</strong> &divide; <strong>'+((pfrDrill.ratioDenominator||pfrDrill.powerBiActiveCount||pfrDrill.totalActive||0))+' Power BI Active Agents</strong> = <strong>'+((pfrDrill.ratioMTD||0).toFixed(2))+'</strong><br>'
      +'Projected month-end: <strong>'+((pfrDrill.projectedMonthLeads||0))+' leads</strong> = projected ratio <strong>'+((pfrDrill.projectedRatio||0).toFixed(2))+'</strong>. The projected lead count is a pace calculation, not additional lead records.'
      +'</div>';
    items=mtd.map(function(l){return{name:(l.referral_partner_name||"Unassigned / no referral partner"),detail:fmt(l.date_added)};});
    body.innerHTML=summary+(items.length?items.map(function(it,i){return pfrListRow(i+1,it.name,it.detail);}).join(""):'<div style="text-align:center;padding:24px;color:var(--text-3);font-size:13px">No Velocify leads found month-to-date.</div>');
    overlay.style.display="flex";
    return;
  }else if(key==="pb:levels"){
    title.textContent="Power BI Level Distribution — raw upload";
    var lv=(pfrDrill.powerBiLevelCounts||{});
    items=[{name:"A",detail:String(lv.A||0)+" agents"},{name:"B",detail:String(lv.B||0)+" agents"},{name:"C",detail:String(lv.C||0)+" agents"},{name:"No Level",detail:String(lv.Blank||0)+" agents"}];
    body.innerHTML='<div style="padding:12px 16px;background:var(--surface-2);font-size:12px">Source: '+escHtml(fmt(pfrDrill.pbSourceStamp))+'. '+escHtml(pfrDrill.pbSyncNote||'Agent-level shared profiles match the current aggregate.')+'</div>'+items.map(function(it,i){return pfrListRow(i+1,it.name,it.detail);}).join('');
    overlay.style.display='flex';return;
  }else if(key==="pb:prequals"||key==="pb:pipeline"){
    var snap=pfrDrill.pbSnapshot||null;
    var isPre=key==="pb:prequals";
    title.textContent=isPre?"Active Prequals — Power BI snapshot":"Active In Pipeline — Power BI snapshot";
    if(!snap){body.textContent='The current shared Power BI upload does not include this aggregate. It is unavailable until the next complete upload.';overlay.style.display='flex';return;}
    var vals=[];
    if(snap&&snap.by_agent){Object.keys(snap.by_agent).forEach(function(k){var r=snap.by_agent[k]||{};var n=isPre?Number(r.active_prequals||0):Number(r.active_pipeline||0);if(n>0)vals.push({name:r.name||k,detail:n+(isPre?" active prequal":" active pipeline")+(n===1?"":"s")+(r.level?" · Power BI "+r.level:"")});});}
    vals.sort(function(a,b){var an=parseInt(a.detail)||0,bn=parseInt(b.detail)||0;return bn-an||String(a.name).localeCompare(String(b.name));});
    var aggregate=isPre?Number(snap&&snap.active_prequals_total||0):Number(snap&&snap.active_pipeline_total||0);
    var listed=vals.reduce(function(total,a){return total+(parseInt(a.detail,10)||0);},0);
    body.innerHTML='<div style="padding:12px 16px;background:var(--surface-2);font-size:12px">Power BI aggregate: <b>'+aggregate+'</b>. '+(vals.length?vals.length+' agents in the available per-agent snapshot; their rows total '+listed+'.':'The shared summary does not include per-agent records.')+(listed!==aggregate?' The source aggregate and available detail differ; check the current Power BI upload.':'')+'</div>'+(vals.length?vals.map(function(v,i){return pfrListRow(i+1,v.name,v.detail);}).join(''):'');
    overlay.style.display='flex';return;
  }else if(key==="pop:powerbi"){
    title.textContent="Raw Power BI Upload — "+String(pfrDrill.uploadedRows)+" rows";
    var rawSnap=pfrDrill.pbSnapshot||null;
    if(rawSnap&&rawSnap.by_agent){
      items=Object.keys(rawSnap.by_agent).map(function(k){var r=rawSnap.by_agent[k]||{};return{name:r.name||k,detail:(r.level?"Power BI "+r.level:"No Power BI level")+" · "+Number(r.active_prequals||0)+" active prequal"+(Number(r.active_prequals||0)===1?"":"s")+" · "+Number(r.active_pipeline||0)+" in pipeline"};});
      items.sort(function(a,b){return String(a.name).localeCompare(String(b.name));});
      body.innerHTML='<div style="padding:12px 16px;background:var(--surface-2);font-size:12px">'+escHtml(String(pfrDrill.uploadedRows))+' raw spreadsheet rows; '+items.length+' unique agent names in the available snapshot. Duplicate raw rows are not retained here.</div>'+items.map(function(it,i){return pfrListRow(i+1,it.name,it.detail);}).join('');
      overlay.style.display='flex';return;
    }else{
      items=(pfrDrill.powerBiActiveRows||[]).map(function(a){return{name:a.agent_name,detail:(a.powerbi_level?"Power BI "+a.powerbi_level:"No Power BI level")+" · current shared roster record"};});
    }
  }else if(key==="pop:rmactive"){
    title.textContent="RM Active Agents — latest Power BI population";
    items=(pfrDrill.rmActivePartners||[]).map(function(a){
      var dates=[];
      if(a.latest_lead_date)dates.push("lead "+fmt(a.latest_lead_date));
      if(a.latest_close_date)dates.push("close "+fmt(a.latest_close_date));
      return{name:a.agent_name,detail:pfrTierLabel(a.tier)+(dates.length?" · "+dates.join(" · "):"")};
    });
  }else if(key.indexOf("tier:")===0){
    var t=key.split(":")[1];
    title.textContent=t==="all"?"All Active Partners":t==="None"?"No Tier Set":t+"-Tier Active Partners";
    items=(pfrDrill.rows||[]).filter(function(r){return t==="all"||(t==="None"?!r.tier:r.tier===t);}).map(function(r){return{name:r.name,detail:pfrTierLabel(r.tier)+" · "+r.health+" · "+(r.daysAny===null?"no touch logged":r.daysAny+"d since last touch")};});
  }else if(key.indexOf("health:")===0){
    var h=key.split(":")[1];
    title.textContent=h==="RecentLead"?"Partners with a lead in the last 45 days":h+" Partners";
    items=(pfrDrill.rows||[]).filter(function(r){return h==="RecentLead"?(r.daysSinceLead!==null&&r.daysSinceLead<=45):r.health===h;}).map(function(r){return{name:r.name,detail:pfrTierLabel(r.tier)+" · "+(r.daysSinceLead===null?"no lead logged":r.daysSinceLead+"d since last lead")};});
  }else if(key.indexOf("mig:")===0){
    var parts=key.split(":");
    title.textContent=parts[1]==="all"?"All Tier Migrations — this period":parts[1]==="other"?"Other Tier Changes":parts[1]+" → "+parts[2]+" Migrations";
    var migList=parts[1]==="all"
      ?(pfrDrill.migrations||[])
      :parts[1]==="other"
        ?(pfrDrill.migrations||[]).filter(function(m){return!((m.from_tier==="C"&&m.to_tier==="B")||(m.from_tier==="B"&&m.to_tier==="A")||(m.from_tier==="A"&&m.to_tier==="Channel"));})
        :(pfrDrill.migrations||[]).filter(function(m){return m.from_tier===parts[1]&&m.to_tier===parts[2];});
    items=migList.map(function(m){return{name:m.agent_name,detail:(m.from_tier||"?")+" → "+(m.to_tier||"?")+" · "+m.migration_date};});
  }
  body.innerHTML=items.length
    ?items.map(function(it,i){return pfrListRow(i+1,it.name,it.detail);}).join("")
    :'<div style="text-align:center;padding:24px;color:var(--text-3);font-size:13px">No activity logged for the selected period.</div>';
  overlay.style.display="flex";
}
window.pfrOpenDrill=pfrOpenDrill;

// Shared detail entry point for cards rendered outside this portfolio closure.
window.pfrShowDetail=function(heading,summary,items){
  var overlay=document.getElementById('pfr-drilldown-overlay');
  var title=document.getElementById('pfr-drilldown-title');
  var body=document.getElementById('pfr-drilldown-body');
  if(!overlay||!title||!body)return;
  title.textContent=heading;
  body.innerHTML='<div style="padding:12px 16px;background:var(--surface-2);font-size:12px;line-height:1.55">'+escHtml(String(summary||''))+'</div>'
    +(items&&items.length?items.map(function(it,i){return pfrListRow(i+1,it.name,escHtml(String(it.detail||'')));}).join(''):'<div style="padding:18px;color:var(--text-3);font-size:12px">No individual records available from this source.</div>');
  overlay.style.display='flex';
};

function pfrCloseDrilldown(){
  document.getElementById("pfr-drilldown-overlay").style.display="none";
}
window.pfrCloseDrilldown=pfrCloseDrilldown;

})();

/* ═══════════════════════════════════════════════════════════════════════
   RM TEAM LEADERSHIP SUMMARY + SHARED OWNER DECODER
   Restores the Relationship Manager tab as a read-only leadership view.
   Amanda/Nyny still perform the actual RM work in the RM Tracker.
   ═══════════════════════════════════════════════════════════════════════ */
function ctRmOwnerFromNotes(notes){
  try{
    var n=String(notes||""),start="\u2063\u2063\u2063",end="\u2064\u2064\u2064";
    var a=n.lastIndexOf(start); if(a<0)return "Amanda";
    var b=n.indexOf(end,a+start.length); if(b<0)return "Amanda";
    var encoded=n.slice(a+start.length,b);
    var bits=encoded.replace(/\u200B/g,"0").replace(/\u200C/g,"1"),out="";
    for(var i=0;i+7<bits.length;i+=8)out+=String.fromCharCode(parseInt(bits.slice(i,i+8),2));
    var obj=JSON.parse(decodeURIComponent(escape(atob(out))));
    return obj.owner||"Amanda";
  }catch(e){return "Amanda";}
}
function ctStripRmMeta(notes){
  try{
    var n=String(notes||""),start="\u2063\u2063\u2063",end="\u2064\u2064\u2064";
    var a=n.lastIndexOf(start);
    if(a>=0){
      var b=n.indexOf(end,a+start.length);
      if(b>=0)n=(n.slice(0,a)+n.slice(b+end.length));
    }
    // Never show tracker/system metadata in any human-facing RM note.
    n=n.replace(/\s*\[TXN_TRIGGER\]/gi,"");
    n=n.replace(/\s*\[TXN_[A-Z_]+(?::[^\]]*)?\]/gi,"");
    n=n.replace(/\s*\[(?:RM_OWNER|RM_ATTENDEES|LP_ATTENDEES|NEXT_STEP_OWNER):[^\]]*\]/gi,"");
    // Shared RM/LP queue records may prefix human notes with machine routing keys.
    // Strip these only from the visible copy; stored notes and read fingerprints stay intact.
    n=n.replace(/\s*\[(?:TUE_[A-Z0-9_]+|LP_OWNER|MATCH_KEY|RM_SUPPLEMENT_KEY|BUILD_KEY|RM_WORK_KEY|RM_WORKFLOW_KEY|PLAN_KEY|TASK_KEY|BATCH_KEY|SYNC_KEY)(?::[^\]]*)?\]/gi,"");
    // Some imported activity puts multiple transport keys at the start of a note.
    // Keep free-text bracketed comments and actual follow-up instructions untouched.
    n=n.replace(/^(?:\s*\[(?:[A-Z][A-Z0-9_]{2,})(?::[^\]]*)?\])+\s*/g,"");
    // Decode URL-escaped human prose only when it isn't a routing key.
    if(/%[0-9a-f]{2}/i.test(n)){
      try{n=decodeURIComponent(n);}catch(_){}
    }
    n=n.replace(/\s*\[(?:TUE_[A-Z0-9_]+|LP_OWNER|MATCH_KEY|RM_SUPPLEMENT_KEY|BUILD_KEY|RM_WORK_KEY|RM_WORKFLOW_KEY|PLAN_KEY|TASK_KEY|BATCH_KEY|SYNC_KEY)(?::[^\]]*)?\]/gi,"");

    // Privacy guard: loan/account identifiers never belong in a human-facing tracker note.
    n=n.replace(/\b(?:Loan\s*(?:Number|No\.?|#)|Ln\s*#)\s*[:#-]?\s*[A-Z0-9][A-Z0-9-]{3,}\b/gi,"");
    n=n.replace(/\b(?:new-contract|clear-to-close)-loan-[A-Z0-9-]+\b/gi,"");
    return n.replace(/\s{2,}/g," ").replace(/\s*[·|]\s*(?=$)/g,"").trim();
  }catch(e){return String(notes||"").replace(/\s*\[TXN_TRIGGER\]/gi,"").replace(/\s*\[TXN_[^\]]*\]/gi,"").trim();}
}

function ctTxnMetaValue(notes,key){
  try{
    var m=String(notes||"").match(new RegExp("\\[TXN_"+key+":([^\\]]*)\\]","i"));
    return m&&m[1]?m[1].trim():"";
  }catch(e){return "";}
}
function ctRmFeedNote(a){
  var raw=String(a&&a.notes||"");
  if(/\[TXN_TRIGGER\]/i.test(raw)){
    var role=ctTxnMetaValue(raw,"ROLE"),client=ctTxnMetaValue(raw,"CLIENT"),property=ctTxnMetaValue(raw,"PROPERTY"),ref=ctTxnMetaValue(raw,"REF");
    if((!client||!property)&&ref){
      var parts=ref.split(/\s+[·|]\s+/).map(function(x){return x.trim();}).filter(Boolean);
      if(!client&&parts.length)client=parts[0];
      if(!property&&parts.length>1)property=parts.slice(1).join(" · ");
    }
    var pieces=[];
    if(role)pieces.push('<span style="font-size:10px;font-weight:850;color:#607985;text-transform:uppercase;letter-spacing:.04em">'+escHtml(role)+' agent</span>');
    if(client)pieces.push('<span><strong>Client:</strong> '+escHtml(client)+'</span>');
    if(property)pieces.push('<span><strong>Property:</strong> '+escHtml(property)+'</span>');
    return pieces.length?'<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:11px;color:#607985;line-height:1.45">'+pieces.join('<span style="color:#c7d0d7">·</span>')+'</div>':'';
  }
  return ctRmPrettyNote(raw,a&&a.act_type);
}

function ctRmNoteFingerprint(lp,a){
  var basis=[
    lp||"",a&&a.id||"",a&&a.agent_name||"",a&&a.act_type||"",
    a&&a.act_date||"",ctStripRmMeta(a&&a.notes||"")
  ].join("|");
  var h=0;for(var i=0;i<basis.length;i++)h=((h<<5)-h+basis.charCodeAt(i))|0;
  return "rmnote:"+String(lp||"").toLowerCase()+":"+Math.abs(h);
}
function ctRmReadMap(lp){
  try{return JSON.parse(localStorage.getItem("lp_rm_notes_read_"+String(lp||"").toLowerCase())||"{}")}catch(e){return{}}
}
function ctRmIsRead(lp,a){var m=ctRmReadMap(lp);return !!m[ctRmNoteFingerprint(lp,a)]}
function ctRmMarkDisplayedRead(lp,rows){
  try{
    var m=ctRmReadMap(lp),now=new Date().toISOString();
    (rows||[]).forEach(function(a){m[ctRmNoteFingerprint(lp,a)]=now});
    var keys=Object.keys(m);if(keys.length>250){keys.sort(function(a,b){return String(m[b]).localeCompare(String(m[a]))});var keep={};keys.slice(0,200).forEach(function(k){keep[k]=m[k]});m=keep}
    localStorage.setItem("lp_rm_notes_read_"+String(lp||"").toLowerCase(),JSON.stringify(m));
  }catch(e){}
}
function ctRmPrettyNote(note,type){
  var clean=ctStripRmMeta(note);
  if(!clean)return "";
  if(String(type||"")==="CTC Call"||/^\s*☎️?\s*CTC\s*\|/i.test(clean)){
    clean=clean.replace(/^\s*☎️?\s*CTC\s*\|\s*/i,"");
    var bits=clean.split("|").map(function(x){return x.trim()}).filter(Boolean);
    var role="",client="",property="",contact="",feedback="",other=[];
    bits.forEach(function(x){
      if(/^(Buyer|Listing|Seller)\s+agent$/i.test(x))role=x;
      else if(/^Client:/i.test(x))client=x.replace(/^Client:\s*/i,"");
      else if(/^Property:/i.test(x))property=x.replace(/^Property:\s*/i,"");
      else if(/^Contact:/i.test(x))contact=x.replace(/^Contact:\s*/i,"");
      else if(/^Feedback:/i.test(x))feedback=x.replace(/^Feedback:\s*/i,"");
      else other.push(x);
    });
    var html="";
    if(client||property)html+='<div style="font-size:11.5px;color:#445B67;margin-bottom:5px">'+(client?'<strong>Client:</strong> '+escHtml(client):'')+(client&&property?' &nbsp;·&nbsp; ':'')+(property?'<strong>Property:</strong> '+escHtml(property):'')+'</div>';
    if(role)html+='<div style="font-size:10px;font-weight:850;color:#607985;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px">'+escHtml(role)+'</div>';
    if(contact)html+='<div style="font-size:12px;color:#243E4A;line-height:1.45"><strong>Contact:</strong> '+escHtml(contact)+'</div>';
    if(feedback)html+='<div style="font-size:12px;color:#243E4A;line-height:1.5;margin-top:3px"><strong>Feedback:</strong> '+escHtml(feedback)+'</div>';
    if(other.length)html+='<div style="font-size:11px;color:#607985;line-height:1.45;margin-top:3px">'+escHtml(other.join(" · "))+'</div>';
    return html||escHtml(clean);
  }
  return '<div style="font-size:12px;color:#243E4A;line-height:1.5">'+escHtml(clean)+'</div>';
}

function ctIsExistingRmMeeting(type){
  return ["Partner Meeting","Break Breads","Strategic Partner Meeting","Channel Meeting","Team / Office Presentation","Retention Meeting"].indexOf(String(type||"").trim())>=0;
}
function ctIsDirectorLeadership(type){
  return ["Amanda Coaching / Development","RM Scorecard Review","RM Portfolio Review","RM Process Improvement","Tracker / System Development","RM Training","RM Leadership Escalation Support"].indexOf(String(type||"").trim())>=0;
}
function ctRmTalkCount(rows){return amCntTalkTo(rows||[]);}
function ctRmCount(rows,type){
  if(type==="__talkto__")return ctRmTalkCount(rows);
  if(type==="__existing__")return (rows||[]).filter(function(a){return ctIsExistingRmMeeting(a.act_type);}).length;
  if(type==="__partner_total__")return (rows||[]).filter(function(a){return a.act_type==="New Realtor Meeting"||ctIsExistingRmMeeting(a.act_type);}).length;
  if(type==="__leadership__")return (rows||[]).filter(function(a){return ctIsDirectorLeadership(a.act_type);}).length;
  return (rows||[]).filter(function(a){return a.act_type===type;}).length;
}

var rmLeadershipCache={all:[],todayStr:"",week:null,monthStart:"",openFlags:0};
rmCurrentPeriod="mtd";

// Core Team leadership view = EXECUTION, not Amanda's to-do list.
// Machine-created New Contract / CTC triggers stay in RM Tracker where the work is performed,
// but they do not count as activity and do not appear in the Core Team feed.
function ctRmIsExecutedActivity(a){
  if(!a)return false;
  try{if(typeof lpIsInternalRmActivity==="function"&&lpIsInternalRmActivity(a))return false;}catch(e){}
  var notes=String(a.notes||""),type=String(a.act_type||"").trim().toLowerCase(),outcome=String(a.outcome||"").trim().toLowerCase();
  if(/\[TXN_TRIGGER\]/i.test(notes))return false;
  if((type==="new contract"||type==="clear to close")&&(/\[TXN_/i.test(notes)||outcome==="requires follow-up"))return false;
  return true;
}

function rmPeriodRows(){
  var rows=(rmLeadershipCache.all||[]).filter(ctRmIsExecutedActivity);
  if(rmCurrentPeriod==="today")return rows.filter(function(a){return a.act_date===rmLeadershipCache.todayStr;});
  if(rmCurrentPeriod==="week")return rows.filter(function(a){return a.act_date>=rmLeadershipCache.week.start&&a.act_date<=rmLeadershipCache.week.end;});
  return rows;
}
function rmMetricTarget(kind,owner){
  if(rmCurrentPeriod==="today"){
    if(owner==="Amanda"&&kind==="cold")return 25;
    if(owner==="Amanda"&&kind==="talk")return 20;
    return null;
  }
  if(rmCurrentPeriod==="week"){
    var wk={
      teamNew:5,
      Amanda:{newM:3,existing:5,total:8,cold:125,talk:100,buddy:3}
    };
    return owner==="Team"?wk.teamNew:(wk[owner]?wk[owner][kind]:null);
  }
  var mo={
    teamNew:20,
    Amanda:{newM:12,existing:18,total:30,cold:500,talk:400,buddy:12}
  };
  return owner==="Team"?mo.teamNew:(mo[owner]?mo[owner][kind]:null);
}
function rmLeadershipTile(label,value,target,sub){
  var pct=target?Math.min(value/target,1):0;
  var color=target?(pct>=1?"#15803d":pct>=.65?"#9A6A18":"#1F4E79"):"#1F4E79";
  return '<div style="background:#f8fafc;border:1px solid var(--border);border-radius:9px;padding:11px 12px;min-width:0">'
    +'<div style="font-size:10.5px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.035em;line-height:1.25">'+label+'</div>'
    +'<div style="font-size:22px;font-weight:800;color:'+color+';margin-top:4px">'+value+(target?' <span style="font-size:11px;font-weight:600;color:#94a3b8">/ '+target+'</span>':'')+'</div>'
    +(target?'<div style="height:4px;background:#e2e8f0;border-radius:3px;margin-top:6px;overflow:hidden"><div style="height:100%;width:'+Math.round(pct*100)+'%;background:'+color+'"></div></div>':'')
    +(sub?'<div style="font-size:10px;color:#64748b;margin-top:5px;line-height:1.3">'+sub+'</div>':'')
    +'</div>';
}

function rmRenderGoals(){
  var body=document.getElementById("rm-goals-body");
  if(!body)return;
  var rows=rmPeriodRows();
  var am=rows.filter(function(a){return ctRmOwnerFromNotes(a.notes)==="Amanda";});
  var aNew=ctRmCount(am,"New Realtor Meeting"),aExisting=ctRmCount(am,"__existing__"),aTotal=ctRmCount(am,"__partner_total__");
  body.innerHTML=
    '<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:10px;flex-wrap:wrap;margin-bottom:12px">'
      +'<div><div style="font-size:13px;font-weight:800;color:#1f2937">Amanda Dearth · Relationship Manager</div>'
      +'<div style="font-size:11px;color:#64748b;margin-top:3px">Read-only leadership view · Amanda’s RM execution only</div></div>'
      +'<div style="font-size:11px;color:#64748b">'+(rmCurrentPeriod==="today"?"Today":rmCurrentPeriod==="week"?"This week":"Month to date")+'</div>'
    +'</div>'
    +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">'
      +rmLeadershipTile("New meetings",aNew,rmMetricTarget("newM","Amanda"),"New partner meetings")
      +rmLeadershipTile("Existing meetings",aExisting,rmMetricTarget("existing","Amanda"),"Partner / Break Bread / strategic")
      +rmLeadershipTile("Total partner meetings",aTotal,rmMetricTarget("total","Amanda"),"30+ monthly working goal")
      +rmLeadershipTile("Cold calls",ctRmCount(am,"Cold Calls"),rmMetricTarget("cold","Amanda"),"Primary outbound")
      +rmLeadershipTile("Talk-to's",ctRmCount(am,"__talkto__"),rmMetricTarget("talk","Amanda"),"Meaningful relationship touches")
      +rmLeadershipTile("Buddy referral asks",ctRmCount(am,"Buddy Intro Received"),rmMetricTarget("buddy","Amanda"),"Referral growth")
    +'</div>';
}

function rmRenderFeed(){
  var el=document.getElementById("rm-feed-list");
  if(!el)return;
  var data=rmPeriodRows().filter(function(a){return ctRmOwnerFromNotes(a.notes)==="Amanda";}).slice();
  data.sort(function(a,b){return String(b.act_date||"").localeCompare(String(a.act_date||""));});
  if(!data.length){el.innerHTML='<div style="text-align:center;padding:20px;color:#64748b;font-size:13px">No completed Amanda RM activity found for this period.</div>';return;}
  el.innerHTML=data.slice(0,80).map(function(a){
    var noteHtml=ctRmFeedNote(a);
    return '<div style="padding:10px 0;border-bottom:1px solid #edf0f4">'
      +'<div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><div><span style="font-size:13px;font-weight:800;color:#1f2937">'+escHtml(displayName(a.agent_name||"—"))+'</span>'
      +'<span style="font-size:10.5px;font-weight:800;color:#1F4E79;margin-left:7px">Amanda</span></div>'
      +'<span style="font-size:11px;color:#64748b">'+fmt(a.act_date)+'</span></div>'
      +'<div style="font-size:12px;color:#475569;margin-top:3px">'+escHtml(a.act_type||"")+(a.outcome?' · '+escHtml(a.outcome):'')+'</div>'
      +(noteHtml?'<div style="margin-top:4px">'+noteHtml+'</div>':'')
      +'</div>';
  }).join("");
}

async function rmLoadAll(){
  var body=document.getElementById("rm-goals-body");
  try{
    var now=new Date(),todayStr=localDateStr(now),week=rmWeekRange();
    var monthStart=now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-01";
    var results=await Promise.all([
      sbFetch("GET","amanda_activities?act_date=gte."+monthStart+"&select=agent_name,act_type,act_date,notes,outcome&order=act_date.desc&limit=4000").catch(function(){return[];}),
      sbFetch("GET","call_logs?flag_rm=eq.true&select=id&limit=500").catch(function(){return[];}),
      sbFetch("GET","lp_flags?resolved=eq.false&select=id&limit=500").catch(function(){return[];})
    ]);
    rmLeadershipCache={all:Array.isArray(results[0])?results[0]:[],todayStr:todayStr,week:week,monthStart:monthStart,openFlags:(results[1]||[]).length+(results[2]||[]).length};
    rmRenderGoals();
    rmRenderFeed();
    var rows=rmPeriodRows();
    var fc=document.getElementById("rm-open-flags-count");if(fc)fc.textContent=rmLeadershipCache.openFlags;
    var ac=document.getElementById("rm-period-activity-count");if(ac)ac.textContent=rows.filter(function(a){return ctRmOwnerFromNotes(a.notes)==="Amanda";}).length;
    var al=document.getElementById("rm-period-activity-label");if(al)al.textContent=(rmCurrentPeriod==="today"?"Today":rmCurrentPeriod==="week"?"This week":"Month to date")+" · logged work only";
    var lr=document.getElementById("rm-last-refreshed");if(lr)lr.textContent="Fetched "+new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
  }catch(e){
    console.warn("RM leadership view failed",e);
    if(body)body.innerHTML='<div style="text-align:center;padding:20px;color:#888;font-size:13px">Could not load RM stats.</div>';
  }
}
function rmSwitchPeriod(period,btn){
  document.querySelectorAll("#view-rm .lpsc-period-btn-light").forEach(function(b){b.classList.remove("active");});
  if(btn)btn.classList.add("active");
  rmCurrentPeriod=period;
  rmRenderGoals();rmRenderFeed();
  var rows=rmPeriodRows(),ac=document.getElementById("rm-period-activity-count"),al=document.getElementById("rm-period-activity-label");
  if(ac)ac.textContent=rows.filter(function(a){return ctRmOwnerFromNotes(a.notes)==="Amanda";}).length;
  if(al)al.textContent=(period==="today"?"Today":period==="week"?"This week":"Month to date")+" · logged work only";
}
function openRmView(btn){
  if(typeof lpStopPolling==="function")lpStopPolling();
  if(typeof rmStopPolling==="function")rmStopPolling();
  currentUser="RM";
  document.querySelectorAll(".who-btn").forEach(function(b){b.classList.remove("active");});
  if(btn)btn.classList.add("active");
  document.querySelectorAll(".view").forEach(function(v){v.classList.remove("active");});
  var view=document.getElementById("view-rm");if(view)view.classList.add("active");
  rmCurrentPeriod="mtd";
  document.querySelectorAll("#view-rm .lpsc-period-btn-light").forEach(function(b){b.classList.toggle("active",(b.textContent||"").trim()==="MTD");});
  rmLoadAll();
  rmStartPolling();
}
function rmStartPolling(){ rmStopPolling(); }
function rmStopPolling(){if(rmPollInterval){clearInterval(rmPollInterval);rmPollInterval=null;}}

// The old LP-side RM execution injectors are intentionally disabled.
// This tracker shows leadership stats; flags are worked and replied to in the RM Tracker.
function ctInjectRmPanels(){return;}

// Make push updates refresh the restored RM leadership tab too.
if(typeof refreshLpSharedData==="function"){
  var _refreshLpSharedDataRmAware=refreshLpSharedData;
  refreshLpSharedData=function(source){
    _refreshLpSharedDataRmAware(source);
    if(currentUser==="RM"&&["amanda_activities","lp_flags","call_logs"].indexOf(source)>=0){
      setTimeout(function(){if(currentUser==="RM")rmLoadAll();},260);
    }
  };
}


// v17 — makeover layer + v16 load recovery; all operational logic preserved.
function runLpUiIntegrityCheck(){const check=()=>{const requiredViews=["welcome","lp","rm","file-integrity","operating-standard","scorecards","snapshot","ownership","data-hub","agent-health","income-standard","leads","lp-conversion","partner-growth","admin","facetime","co-marketing","agent-search","portfolio","production-manager"];const missingViews=requiredViews.filter(n=>!document.getElementById("view-"+n));if(missingViews.length)console.error("LP Tracker UI integrity issue: missing "+missingViews.join(", "));else console.log("LP Tracker UI integrity check passed ("+requiredViews.length+" views)");};if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",check,{once:true});else setTimeout(check,0);}
runLpUiIntegrityCheck();
// v45 watchdog: a slow request is shown as slow, not falsely reported as disconnected.
// Successful Supabase traffic automatically restores Live through lpMarkServerReachable().
setTimeout(function(){
  var ind=document.getElementById("saveInd");
  if(ind&&(/Connecting|Loading/.test(ind.textContent||"")))setSyncStatus("slow");
},18000);
