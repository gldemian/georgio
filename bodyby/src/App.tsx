import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import './index.css';

import { WORKOUTS, weightFor, planToText, CATEGORY_INFO, type Ctx, type Plan, type Workout } from './lib/workouts';
import { planToTcx } from './lib/tcx';
import { buildPaces, vdotFrom, parseTime } from './lib/vdot';
import * as sfx from './lib/audio';

export default function App() {
  const [miles, setMiles] = useState(6);
  const [hate, setHate] = useState(0);
  const [fiveK, setFiveK] = useState("20:00");
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ workout: Workout, plan: Plan } | null>(null);
  const [rotation, setRotation] = useState(0);

  const vdot = useMemo(() => {
    const t = parseTime(fiveK);
    return t ? vdotFrom(5000, t) : 50;
  }, [fiveK]);
  const paces = useMemo(() => buildPaces(vdot), [vdot]);

  const handleSpin = () => {
    if (miles <= 0) return alert('Enter valid mileage');
    setSpinning(true);
    setResult(null);
    sfx.unlock();

    const ctx: Ctx = { miles, hate, h: Math.min(hate, 9) / 9, p: paces, vdot };
    
    let winningIndex = 0;
    if (hate === 10) {
      winningIndex = WORKOUTS.findIndex(w => w.category === 'PIZZA');
      if (winningIndex === -1) winningIndex = 0;
    } else {
      let validWorkouts = WORKOUTS.map((w, i) => ({ w, i, weight: weightFor(w, hate) }))
                                  .filter(x => x.weight > 0 && x.w.minMiles <= miles);
      
      validWorkouts = validWorkouts.filter(x => x.w.build(ctx) !== null);
      
      if (validWorkouts.length === 0) {
         alert("No workouts fit this mileage! Increase miles.");
         setSpinning(false);
         return;
      }
      
      const totalWeight = validWorkouts.reduce((sum, x) => sum + x.weight, 0);
      let r = Math.random() * totalWeight;
      for (const item of validWorkouts) {
        r -= item.weight;
        if (r <= 0) {
          winningIndex = item.i;
          break;
        }
      }
    }

    let ticks = 0;
    const interval = setInterval(() => {
      sfx.tick();
      ticks++;
      if (ticks > 25) clearInterval(interval);
    }, 100);

    const segmentAngle = 360 / WORKOUTS.length;
    const centerOfWinner = (winningIndex + 0.5) * segmentAngle;
    const offset = (Math.random() - 0.5) * (segmentAngle * 0.8);
    const targetRotation = 360 * 5 + (360 - centerOfWinner) + offset;

    setRotation(prev => prev + targetRotation);

    setTimeout(() => {
      setSpinning(false);
      
      const winningWorkout = WORKOUTS[winningIndex];
      const plan = winningWorkout.build(ctx)!;
      setResult({ workout: winningWorkout, plan });
      
      if (winningWorkout.category === 'PIZZA') {
        sfx.pizza();
      } else if (winningWorkout.dread >= 4) {
        sfx.doom();
      } else {
        sfx.win();
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
      }
    }, 3000);
  };

  const handleDownloadTCX = () => {
    if (!result) return;
    const tcx = planToTcx(result.workout, result.plan, paces);
    const blob = new Blob([tcx], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.workout.short.replace(/\\s+/g, "_")}.tcx`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const handleDownloadText = () => {
    if (!result) return;
    const text = planToText(result.workout, result.plan, paces);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.workout.short.replace(/\\s+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const conicStops = WORKOUTS.map((w, i) => {
    const start = (i * 360) / WORKOUTS.length;
    const end = ((i + 1) * 360) / WORKOUTS.length;
    return `${CATEGORY_INFO[w.category].color} ${start}deg ${end}deg`;
  }).join(', ');

  return (
    <div className="container">
      <h1>body by george</h1>

      <div className="inputs">
        <label>
          Miles:
          <input type="number" value={miles} onChange={e => setMiles(parseFloat(e.target.value))} min="1" step="0.5" />
        </label>
        <label>
          Recent 5K Time (mm:ss):
          <input type="text" value={fiveK} onChange={e => setFiveK(e.target.value)} placeholder="20:00" />
        </label>
        <label>
          Self-Hate (0-10):
          <input type="range" min="0" max="10" value={hate} onChange={e => setHate(parseInt(e.target.value))} />
          <span>{hate}</span>
          {hate === 10 && <span style={{fontSize: '0.6rem', color: '#000'}}>100% Pizza Rate Activated</span>}
        </label>
      </div>

      <div className="wheel-container">
        <div className="pointer">▼</div>
        <motion.div
          className="wheel"
          style={{ background: `conic-gradient(${conicStops})` }}
          animate={{ rotate: rotation }}
          transition={{ duration: 3, ease: "circOut" }}
          onUpdate={(latest) => {
            if (spinning && (latest.rotate as number % 15) < 2) sfx.slider(hate);
          }}
        >
          {WORKOUTS.map((w, i) => {
            const segmentAngle = 360 / WORKOUTS.length;
            const segRotation = i * segmentAngle + (segmentAngle / 2);
            return (
              <div key={i} className="wheel-segment" style={{ transform: `rotate(${segRotation}deg)` }}>
                <span style={{ 
                  color: CATEGORY_INFO[w.category].ink, 
                  background: CATEGORY_INFO[w.category].color 
                }}>
                  {w.short}
                </span>
              </div>
            );
          })}
        </motion.div>
      </div>

      <button className="spin-btn" onClick={handleSpin} disabled={spinning}>
        {spinning ? 'SPINNING...' : 'SPIN FOR WORKOUT!'}
      </button>

      {result && (
        <motion.div className="result-card" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <h2 style={{color: CATEGORY_INFO[result.workout.category].ink, background: CATEGORY_INFO[result.workout.category].color, display: 'inline-block', padding: '5px'}}>
            {result.workout.name}
          </h2>
          <p><em>{result.workout.why}</em></p>
          <p style={{fontSize: '0.8rem', color: '#555'}}><strong>Roast:</strong> {result.workout.roast}</p>
          <div className="plan-details">
            <h3 style={{fontSize: '1rem', marginTop: '1rem'}}>{result.plan.headline}</h3>
            {result.plan.sessions.map((sess, i) => (
              <div key={i}>
                {sess.title && <h4 style={{fontSize: '0.9rem'}}>[{sess.title}]</h4>}
                <ul style={{fontSize: '0.75rem', paddingLeft: '1.2rem', fontFamily: 'Roboto, sans-serif', fontWeight: 700}}>
                  {sess.blocks.map((b, bi) => (
                    <li key={bi}>
                      {b.kind === 'step' ? (
                         <span>{b.step.label} {b.step.note ? `(${b.step.note})` : ''}</span>
                      ) : (
                         <span>{b.reps} × {b.steps.map(s => s.label).join(' / ')}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p style={{fontSize: '0.8rem', marginTop: '1rem', fontWeight: 'bold'}}>
            {result.workout.cues.map((cue, i) => <span key={i} style={{display: 'block'}}>• {cue}</span>)}
          </p>
          <div style={{display: 'flex', gap: '10px', marginTop: '1rem'}}>
            <button className="download-btn" onClick={handleDownloadTCX}>Download TCX</button>
            <button className="download-btn" onClick={handleDownloadText}>Download TXT</button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
