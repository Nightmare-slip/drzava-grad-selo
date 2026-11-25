import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import { Crown, Copy, DoorOpen, Gamepad2, LogOut, Play, Trophy, Users, Check, X, Clock3 } from "lucide-react";
import "./style.css";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = url && anon ? createClient(url, anon) : null;
const CATS = ["Država", "Grad", "Selo", "Rijeka", "Biljka", "Ime", "Predmet"];
const LETTERS = [..."ABCDEFGHIJKLMNOPRSTUVZČĆĐŠŽ"]; // latinica, bez Q/W/X/Y
const emptyAnswers = Object.fromEntries(CATS.map(c => [c, ""]));
const code4 = () => String(Math.floor(1000 + Math.random() * 9000));
const errText = e => e?.message || "Došlo je do greške.";

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [screen, setScreen] = useState("login");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [votes, setVotes] = useState([]);
  const [draft, setDraft] = useState(emptyAnswers);
  const [timeLeft, setTimeLeft] = useState(120);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [voted, setVoted] = useState({});
  const [ready, setReady] = useState(false);
  const [showPin, setShowPin] = useState(false);

  const me = profile?.id;
  const isAdmin = !!room && room.admin_id === me;
  const currentCategory = CATS[room?.category_index ?? 0];
  const myAnswers = useMemo(() => answers.filter(a => a.player_id === me), [answers, me]);

  const say = msg => { setNotice(msg); window.setTimeout(() => setNotice(""), 4200); };
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({data}) => setSession(data.session));
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_e,s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  async function ensureAuth() {
    let { data: { session: s } } = await supabase.auth.getSession();
    if (!s) {
      const {data,error} = await supabase.auth.signInAnonymously();
      if (error) throw error;
      s = data.session;
    }
    setSession(s);
    return s.user.id;
  }

  async function register() {
    if (!name.trim() || !/^\d{4}$/.test(pin)) return say("Unesi ime i PIN od tačno 4 cifre.");
    setBusy(true);
    try {
      const uid = await ensureAuth();
      const {data,error} = await supabase.rpc("register_player", {p_name:name.trim(), p_pin:pin});
      if (error) throw error;
      setProfile(data); localStorage.setItem("dgs_profile", JSON.stringify({name:name.trim()}));
      setScreen("home"); say("Profil je napravljen!");
    } catch(e) { say(errText(e)); }
    finally { setBusy(false); }
  }

  async function login() {
    if (!name.trim() || !/^\d{4}$/.test(pin)) return say("Unesi ime i PIN od 4 cifre.");
    setBusy(true);
    try {
      await ensureAuth();
      const {data,error} = await supabase.rpc("claim_player", {p_name:name.trim(), p_pin:pin});
      if (error) throw error;
      setProfile(data); localStorage.setItem("dgs_profile", JSON.stringify({name:name.trim()}));
      setScreen("home"); say("Prijavljen si!");
    } catch(e) { say("Nije pronađen profil. Provjeri ime i PIN ili napravi novi profil."); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!supabase || !session || profile) return;
    const saved = JSON.parse(localStorage.getItem("dgs_profile") || "null");
    if (saved) { setName(saved.name); setPin(saved.pin); }
  }, [session, profile]);

  async function createRoom() {
    setBusy(true);
    try {
      const code = code4();
      const {data,error} = await supabase.from("rooms").insert({
        code, admin_id:me, status:"lobby", category_index:0, letter:null, round_ends_at:null
      }).select().single();
      if (error) throw error;
      await joinRoomById(data);
    } catch(e) { say(errText(e)); }
    finally { setBusy(false); }
  }

  async function joinRoom() {
    const {data,error} = await supabase.from("rooms").select("*").eq("code", roomCode.trim()).maybeSingle();
    if (error || !data) return say("Soba sa tim kodom ne postoji.");
    await joinRoomById(data);
  }

  async function joinRoomById(r) {
    try {
      const {data:existing} = await supabase.from("room_players").select("*").eq("room_id",r.id).eq("player_id",me).maybeSingle();
      if (!existing) {
        const {count} = await supabase.from("room_players").select("*",{count:"exact",head:true}).eq("room_id",r.id);
        if ((count || 0) >= 10) return say("Soba je puna (maksimalno 10 igrača).");
        const {error} = await supabase.from("room_players").insert({room_id:r.id,player_id:me,player_name:profile.name});
        if (error) throw error;
      }
      setRoom(r); setScreen("room");
    } catch(e) { say(errText(e)); }
  }

  async function refreshRoom() {
    if (!room) return;
    const [{data:r},{data:p},{data:a},{data:v}] = await Promise.all([
      supabase.from("rooms").select("*").eq("id",room.id).single(),
      supabase.from("room_players").select("*").eq("room_id",room.id).order("joined_at"),
      supabase.from("answers").select("*").eq("room_id",room.id),
      supabase.from("votes").select("*").eq("room_id",room.id)
    ]);
    if (r) setRoom(r); if (p) setPlayers(p); if (a) setAnswers(a); if (v) setVotes(v);
  }

  useEffect(() => {
    if (!room || !supabase) return;
    refreshRoom();
    const channel = supabase.channel("room-"+room.id)
      .on("postgres_changes",{event:"*",schema:"public",table:"rooms",filter:`id=eq.${room.id}`},refreshRoom)
      .on("postgres_changes",{event:"*",schema:"public",table:"room_players",filter:`room_id=eq.${room.id}`},refreshRoom)
      .on("postgres_changes",{event:"*",schema:"public",table:"answers",filter:`room_id=eq.${room.id}`},refreshRoom)
      .on("postgres_changes",{event:"*",schema:"public",table:"votes",filter:`room_id=eq.${room.id}`},refreshRoom)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [room?.id]);

  useEffect(() => {
    if (!room || room.status !== "playing" || !room.round_ends_at) return;
    const tick = () => setTimeLeft(Math.max(0, Math.ceil((new Date(room.round_ends_at).getTime()-Date.now())/1000)));
    tick(); const t = setInterval(tick,1000); return () => clearInterval(t);
  }, [room?.round_ends_at, room?.status]);

  useEffect(() => {
    if (room?.status === "playing" && timeLeft === 0 && isAdmin) finishRound();
  }, [timeLeft, room?.status, isAdmin]);

  async function startRound() {
    if (!isAdmin) return;
    const letter = LETTERS[Math.floor(Math.random()*LETTERS.length)];
    const {error} = await supabase.from("rooms").update({
      status:"playing", letter, category_index:0, round_ends_at:new Date(Date.now()+120000).toISOString()
    }).eq("id",room.id);
    if (error) say(errText(error));
    await supabase.from("answers").delete().eq("room_id",room.id);
    await supabase.from("votes").delete().eq("room_id",room.id);
    await supabase.from("room_players").update({ready:false}).eq("room_id",room.id);
    setDraft(emptyAnswers); setReady(false);
  }

  async function finishRound() {
    if (!isAdmin) return;
    await supabase.from("rooms").update({status:"review",category_index:0,round_ends_at:null}).eq("id",room.id);
  }

  async function submitAnswers() {
    if (CATS.some(c => !draft[c].trim())) return say("Popuni sve kategorije prije predaje.");
    setBusy(true);
    try {
      const rows = CATS.map(category => ({room_id:room.id,player_id:me,player_name:profile.name,category,answer:draft[category].trim()}));
      const {error} = await supabase.from("answers").upsert(rows,{onConflict:"room_id,player_id,category"});
      if (error) throw error;
      say("Odgovori su predati. Sačekaj kraj runde.");
    } catch(e) { say(errText(e)); }
    finally { setBusy(false); }
  }

  async function vote(answerId, value) {
    const {error} = await supabase.from("votes").upsert({room_id:room.id,answer_id:answerId,voter_id:me,valid:value},{onConflict:"answer_id,voter_id"});
    if (error) say(errText(error)); else setVoted(v=>({...v,[answerId]:value}));
  }

  function pointsFor(a) {
    const same = answers.filter(x=>x.category===a.category && x.answer.trim().toLocaleLowerCase()===a.answer.trim().toLocaleLowerCase());
    const submitted = answers.filter(x=>x.category===a.category && x.answer.trim()).length;
    const rejected = votes.filter(v=>v.answer_id===a.id && v.valid===false).length;
    const accepted = votes.filter(v=>v.answer_id===a.id && v.valid===true).length;
    const noMajority = rejected > accepted && rejected > 0;
    if (noMajority) return 0;
    if (submitted === 1) return 20;
    if (same.length > 1) return 5;
    return 10;
  }

  async function nextCategory() {
    if (ready) return;
    const {error} = await supabase.from("room_players").update({ready:true}).eq("room_id",room.id).eq("player_id",me);
    if (error) return say(errText(error));
    setReady(true);
    say("Potvrdio si. Čeka se ostatak ekipe.");
  }

  // Only the room admin advances the shared category after everyone is ready.
  useEffect(() => {
    if (!isAdmin || room?.status !== "review" || !players.length || !players.every(p=>p.ready)) return;
    let cancelled = false;
    (async () => {
      if (room.category_index < CATS.length - 1) {
        await supabase.from("room_players").update({ready:false}).eq("room_id",room.id);
        if (!cancelled) await supabase.from("rooms").update({category_index:room.category_index+1}).eq("id",room.id);
        setReady(false);
      } else {
        await supabase.from("rooms").update({status:"results"}).eq("id",room.id);
      }
    })();
    return () => { cancelled = true; };
  }, [players, room?.id, room?.status, room?.category_index, isAdmin]);

  async function endGame() {
    if (!isAdmin) return;
    await supabase.from("rooms").update({status:"results"}).eq("id",room.id);
  }

  async function leaveRoom() {
    if (room) await supabase.from("room_players").delete().eq("room_id",room.id).eq("player_id",me);
    setRoom(null); setPlayers([]); setAnswers([]); setVotes([]); setScreen("home");
  }

  async function logout() {
    localStorage.removeItem("dgs_profile"); await supabase.auth.signOut();
    setProfile(null); setRoom(null); setScreen("login"); setPin("");
  }

  const totals = useMemo(() => players.map(p => ({
    ...p, points: answers.filter(a=>a.player_id===p.player_id).reduce((sum,a)=>sum+pointsFor(a),0)
  })).sort((a,b)=>b.points-a.points), [players,answers,votes]);

  if (!supabase) return <main className="setup"><div className="logo">DGS</div><h1>Još samo povezivanje</h1><p>U folderu projekta napravi fajl <b>.env</b> i upiši Supabase URL i anon key. Uputstvo je u README fajlu.</p></main>;

  return <main className="app">
    <header><div className="brand"><span className="brand-icon"><Gamepad2/></span><div><b>DRŽAVA, GRAD, SELO</b><small>igra za društvo</small></div></div>
      {profile && <button className="icon-btn" onClick={logout} aria-label="Odjava"><LogOut size={18}/></button>}
    </header>
    {notice && <div className="toast">{notice}</div>}
    {screen==="login" && <section className="panel auth">
      <div className="hero-icon">🎲</div><p className="eyebrow">DOBRO DOŠAO U DRUŠTVO</p><h1>Ko danas pobjeđuje?</h1><p className="muted">Napravi profil ili se prijavi svojim imenom i četverocifrenim PIN-om.</p>
      <label>Ime igrača<input value={name} onChange={e=>setName(e.target.value)} placeholder="Npr. Marko" maxLength={18}/></label>
      <label>PIN igrača (4 cifre)<input value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,"").slice(0,4))} inputMode="numeric" placeholder="1234" type={showPin?"text":"password"}/></label>
      <label className="check"><input type="checkbox" checked={showPin} onChange={e=>setShowPin(e.target.checked)}/> Prikaži PIN</label>
      <button className="primary" disabled={busy} onClick={login}>Prijavi se</button>
      <button className="secondary" disabled={busy} onClick={register}>Napravi novi profil</button>
      <p className="tiny">Zapamti PIN — trebaće ti za prijavu na drugom uređaju.</p>
    </section>}
    {screen==="home" && <section className="panel">
      <p className="eyebrow">ZDRAVO, {profile?.name?.toUpperCase()}</p><h1>Spreman za igru?</h1>
      <div className="action-card"><div className="action-icon"><Crown/></div><div><h3>Napravi sobu</h3><p>Ti si admin i pokrećeš igru.</p></div><button className="primary compact" onClick={createRoom} disabled={busy}>Kreiraj</button></div>
      <div className="join-box"><h3><DoorOpen size={19}/> Pridruži se sobi</h3><input value={roomCode} onChange={e=>setRoomCode(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="Četverocifreni kod" inputMode="numeric" maxLength={4}/><button className="secondary" onClick={joinRoom}>Uđi u sobu</button></div>
      <p className="tiny">Maksimalno 10 igrača u jednoj sobi.</p>
    </section>}
    {screen==="room" && room && <section className="panel">
      <div className="room-top"><div><p className="eyebrow">KOD SOBE</p><h1 className="room-code">{room.code}</h1></div><button className="secondary copy" onClick={()=>navigator.clipboard?.writeText(room.code)}><Copy size={16}/> Kopiraj</button></div>
      <div className="players-title"><h3><Users size={18}/> Igrači ({players.length}/10)</h3><span>{isAdmin?"TI SI ADMIN":"ČEKA SE ADMIN"}</span></div>
      <div className="player-list">{players.map(p=><div className="player" key={p.player_id}><span className="avatar">{p.player_name.slice(0,1).toUpperCase()}</span>{p.player_name}{p.player_id===room.admin_id&&<Crown size={15} className="gold"/>}{p.player_id===me&&<small>(ti)</small>}</div>)}</div>
      {room.status==="lobby" && <div className="waiting"><div className="pulse"></div><h2>Čekamo ekipu...</h2><p>Pošalji kod sobe prijateljima.</p>{isAdmin?<button className="primary" onClick={startRound} disabled={players.length<1}><Play size={18}/> POKRENI IGRU</button>:<p className="muted">Admin će pokrenuti igru kada bude spreman.</p>}</div>}
      {room.status==="playing" && <div className="game">
        <div className="game-head"><div><span className="eyebrow">TRENUTNO SLOVO</span><div className="letter">{room.letter}</div></div><div className="timer"><Clock3 size={17}/>{Math.floor(timeLeft/60)}:{String(timeLeft%60).padStart(2,"0")}</div></div>
        <p className="muted">Unesi riječ koja počinje slovom <b>{room.letter}</b>.</p>
        <div className="fields">{CATS.map(c=><label key={c}>{c}<input value={draft[c]} onChange={e=>setDraft(d=>({...d,[c]:e.target.value}))} placeholder={`${c} na ${room.letter}...`} disabled={myAnswers.length>0}/></label>)}</div>
        {myAnswers.length===0?<button className="primary" onClick={submitAnswers} disabled={busy}>PREDaj ODGOVORE</button>:<p className="success"><Check size={18}/> Odgovori su predati.</p>}
        <div className="submitted">{players.filter(p=>answers.some(a=>a.player_id===p.player_id)).length} / {players.length} igrača predalo odgovore</div>
        {isAdmin&&<button className="danger outline" onClick={finishRound}>Završi rundu ranije</button>}
      </div>}
      {room.status==="review" && <div className="review">
        <p className="eyebrow">PREGLED ODGOVORA</p><div className="review-letter">{room.letter}</div><h2>{currentCategory}</h2><p className="muted">Pregledajte odgovore. Glasaj za svaki odgovor osim svog. Većina glasova odlučuje; bez glasova odgovor ostaje prihvaćen.</p>
        {answers.filter(a=>a.category===currentCategory).map(a=>{
          const avotes=votes.filter(v=>v.answer_id===a.id);
          return <div className="answer-card" key={a.id}><div><b>{a.player_name}</b><strong>{a.answer}</strong><small>{avotes.filter(v=>v.valid===false).length} ❌ · {avotes.filter(v=>v.valid===true).length} ✅</small></div>
            {a.player_id!==me&&<div className="vote-buttons"><button className={voted[a.id]===true?"selected yes":""} onClick={()=>vote(a.id,true)}><Check size={16}/></button><button className={voted[a.id]===false?"selected no":""} onClick={()=>vote(a.id,false)}><X size={16}/></button></div>}
            {a.player_id===me&&<small className="muted">Tvoj odgovor</small>}
          </div>;
        })}
        <button className="primary" onClick={nextCategory} disabled={ready}>{ready?"ČEKA SE OSTATAK EKIPE":"DALJE →"}</button>
        <p className="tiny">Kategorija {room.category_index+1} od {CATS.length}</p>
        {isAdmin&&<button className="danger outline" onClick={endGame}>ZAVRŠI IGRU</button>}
      </div>}
      {room.status==="results" && <div className="results"><div className="trophy">🏆</div><p className="eyebrow">KRAJ IGRE</p><h1>Konačni rezultati</h1>{totals.map((p,i)=><div className={`rank rank-${i+1}`} key={p.player_id}><b>{i+1}.</b><span>{p.player_name}{p.player_id===room.admin_id&&<Crown size={14}/>}</span><strong>{p.points} bod.</strong></div>)}{isAdmin&&<button className="primary" onClick={startRound}>IGRAJ PONOVO</button>}</div>}
      <button className="leave" onClick={leaveRoom}>Napusti sobu</button>
    </section>}
    <footer>🎲 Dobra zabava i bez svađe oko bodova.</footer>
  </main>;
}

createRoot(document.getElementById("root")).render(<App />);
