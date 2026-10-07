import { useState } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import './index.css';

const WORKOUT_TYPES = [
  "Easy Run",
  "Tempo Run",
  "Track Intervals",
  "Mile Repeats",
  "Fartlek",
  "Progression Run"
];

function generateDynamicWorkout(type: string, targetMiles: number) {
  if (targetMiles < 1) {
    return { name: `${type} (Short)`, description: `Just run ${targetMiles.toFixed(2)} miles. Try not to trip.`, distance: targetMiles };
  }

  let name = "";
  let description = "";

  switch (type) {
    case "Easy Run":
      name = `Easy ${targetMiles.toFixed(2)} mi`;
      description = `Run a comfortable ${targetMiles.toFixed(2)} miles at conversational pace. Don't push it.`;
      break;
    case "Tempo Run":
      if (targetMiles >= 3) {
        const warm = 1;
        const cool = 1;
        const tempo = (targetMiles - warm - cool).toFixed(2);
        name = `${tempo} mi Tempo`;
        description = `${warm} mi warm up, ${tempo} mi at threshold pace, ${cool} mi cool down.`;
      } else {
        const split = +(targetMiles / 3).toFixed(2);
        name = `Mini Tempo`;
        description = `${split} mi warm up, ${(targetMiles - split * 2).toFixed(2)} mi tempo, ${split} mi cool down.`;
      }
      break;
    case "Track Intervals":
      const wc = targetMiles > 3 ? 1 : 0.5;
      const work = targetMiles - (wc * 2);
      if (work > 0.5) {
        const reps = Math.max(1, Math.floor(work / 0.375)); // 400m (0.25) + 200m (0.125)
        const rem = +(work - (reps * 0.375)).toFixed(2);
        const extraCool = +(wc + rem).toFixed(2);
        name = `${reps}x400m Intervals`;
        description = `${wc} mi warm up, ${reps} x 400m hard (w/ 200m jog recovery), ${extraCool} mi cool down.`;
      } else {
        name = `Sprint Intervals`;
        description = `${targetMiles.toFixed(2)} mi total: alternate 30s sprints and 1min jogs.`;
      }
      break;
    case "Mile Repeats":
      if (targetMiles >= 4) {
        const wc2 = 1;
        const work2 = targetMiles - (wc2 * 2);
        const reps2 = Math.max(1, Math.floor(work2 / 1.25)); // 1mi hard + 0.25mi rest
        const rem2 = +(work2 - (reps2 * 1.25)).toFixed(2);
        const extraCool2 = +(wc2 + rem2).toFixed(2);
        name = `${reps2}x1mi Repeats`;
        description = `${wc2} mi warm up, ${reps2} x 1 mi hard (w/ 0.25 mi jog recovery), ${extraCool2} mi cool down.`;
      } else {
        name = `Half-Mile Repeats`;
        const reps = Math.max(1, Math.floor((targetMiles - 1) / 0.75));
        const rem = +(targetMiles - 1 - (reps * 0.75)).toFixed(2);
        description = `0.5 mi warm up, ${reps} x 0.5 mi hard (w/ 0.25 mi jog recovery), ${(0.5 + rem).toFixed(2)} mi cool down.`;
      }
      break;
    case "Fartlek":
      name = `Fartlek Fun`;
      description = `Run ${targetMiles.toFixed(2)} miles. Every time you see a dog, a stop sign, or someone in neon, sprint for 30 seconds.`;
      break;
    case "Progression Run":
      const third = +(targetMiles / 3).toFixed(2);
      name = `Progression Run`;
      description = `Divide into thirds: ${third} mi easy, ${third} mi moderate, ${(targetMiles - 2 * third).toFixed(2)} mi hard.`;
      break;
  }
  return { name, description, distance: targetMiles };
}

function generateTCX(name: string, distanceMiles: number) {
  const distanceMeters = (distanceMiles * 1609.344).toFixed(0);
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity Sport="Running">
      <Id>${now}</Id>
      <Lap StartTime="${now}">
        <TotalTimeSeconds>3600</TotalTimeSeconds>
        <DistanceMeters>${distanceMeters}</DistanceMeters>
        <Intensity>Active</Intensity>
      </Lap>
      <Notes>${name}</Notes>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;
}

export default function App() {
  const [miles, setMiles] = useState(5);
  const [hate, setHate] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [rotation, setRotation] = useState(0);

  const handleSpin = () => {
    if (miles <= 0) return alert('Enter valid mileage');
    setSpinning(true);
    setResult(null);

    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContext();

    let ticks = 0;
    const interval = setInterval(() => {
      const osc = audioCtx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400 + Math.random() * 200, audioCtx.currentTime);
      osc.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.05);
      ticks++;
      if (ticks > 25) clearInterval(interval);
    }, 100);

    // Calculate rotation and determine which segment wins
    const segmentAngle = 360 / WORKOUT_TYPES.length;
    const winningSegmentIndex = Math.floor(Math.random() * WORKOUT_TYPES.length);

    // We want the pointer (top, 0deg) to land in the middle of the winning segment.
    // Notice that segment i spans from i*segmentAngle to (i+1)*segmentAngle, centered at (i + 0.5) * segmentAngle.
    // If the wheel rotates by R, the segment at the top is the one where (center + R) % 360 == 0.
    // So R = 360 - center + random offset inside segment.
    const centerOfWinner = (winningSegmentIndex + 0.5) * segmentAngle;
    const offset = (Math.random() - 0.5) * (segmentAngle * 0.8); // random offset within 80% of segment
    const targetRotation = 360 * 5 + (360 - centerOfWinner) + offset;

    setRotation(prev => prev + targetRotation);

    setTimeout(() => {
      setSpinning(false);

      let multiplier = 1;
      if (hate >= 7 && hate <= 10) {
        multiplier += 0.2 + ((hate - 7) / 3) * 0.3;
      }
      const targetMiles = +(miles * multiplier).toFixed(2);

      const winningType = WORKOUT_TYPES[winningSegmentIndex];
      const workout = generateDynamicWorkout(winningType, targetMiles);

      setResult({ targetMiles, workout });
      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });

      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.5);
      osc.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.5);

    }, 3000);
  };

  const handleDownload = () => {
    if (!result) return;
    const tcx = generateTCX(result.workout.name, result.workout.distance);
    const blob = new Blob([tcx], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.workout.name.replace(/\\s+/g, "_")}.tcx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container">
      <h1>body by george</h1>

      <div className="inputs">
        <label>
          Miles:
          <input type="number" value={miles} onChange={e => setMiles(parseFloat(e.target.value))} min="1" step="0.1" />
        </label>
        <label>
          Self-Hate (0-10):
          <input type="range" min="0" max="10" value={hate} onChange={e => setHate(parseInt(e.target.value))} />
          <span>{hate}</span>
        </label>
      </div>

      <div className="wheel-container">
        <div className="pointer">▼</div>
        <motion.div
          className="wheel"
          animate={{ rotate: rotation }}
          transition={{ duration: 3, ease: "circOut" }}
        >
          {WORKOUT_TYPES.map((type, i) => {
            const segmentAngle = 360 / WORKOUT_TYPES.length;
            const rotation = i * segmentAngle + (segmentAngle / 2);
            return (
              <div key={i} className="wheel-segment" style={{ transform: `rotate(${rotation}deg)` }}>
                <span>{type}</span>
              </div>
            );
          })}
        </motion.div>
      </div>

      <button className="spin-btn" onClick={handleSpin} disabled={spinning}>
        {spinning ? 'Spinning...' : 'SPIN FOR WORKOUT!'}
      </button>

      {result && (
        <motion.div className="result-card" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <h2>{result.workout.name}</h2>
          <p>{result.workout.description}</p>
          <p><strong>Planned:</strong> {result.workout.distance} mi</p>
          <button className="download-btn" onClick={handleDownload}>Download Garmin TCX</button>
        </motion.div>
      )}
    </div>
  );
}
