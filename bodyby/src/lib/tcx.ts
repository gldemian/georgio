import { MI, type Paces, type Zone } from './vdot';
import { stepPace, type Plan, type Step, type Workout } from './workouts';

// Structured-workout TCX (Workouts schema), not a fake activity.
// Easy/jog/float steps get no pace target so your watch doesn't nag you on recoveries.

const NO_TARGET: Zone[] = ['REC', 'E', 'JOG', 'REST', 'FLOAT', 'SPRINT', 'HILL'];

const clean = (x: string) => x.replace(/[^\w .\-]/g, '').trim().slice(0, 15) || 'Step';

function stepXml(st: Step, p: Paces, id: number): string {
  const dur =
    st.seconds !== undefined || st.zone === 'REST'
      ? `<Duration xsi:type="Time_t"><Seconds>${Math.round(st.seconds ?? 0)}</Seconds></Duration>`
      : `<Duration xsi:type="Distance_t"><Meters>${Math.round(st.meters ?? 0)}</Meters></Duration>`;
  const resting = st.zone === 'REST' || st.zone === 'JOG';
  let target = '<Target xsi:type="None_t"/>';
  if (!NO_TARGET.includes(st.zone)) {
    const v = MI / stepPace(st, p);
    target = `<Target xsi:type="Speed_t"><SpeedZone xsi:type="CustomSpeedZone_t"><LowInMetersPerSecond>${(v * 0.97).toFixed(3)}</LowInMetersPerSecond><HighInMetersPerSecond>${(v * 1.03).toFixed(3)}</HighInMetersPerSecond></SpeedZone></Target>`;
  }
  return `<StepId>${id}</StepId><Name>${clean(st.label)}</Name>${dur}<Intensity>${resting ? 'Resting' : 'Active'}</Intensity>${target}`;
}

export function planToTcx(w: Workout, plan: Plan, p: Paces): string {
  const workouts = plan.sessions.map((sess) => {
    let id = 1;
    const parts: string[] = [];
    for (const b of sess.blocks) {
      if (b.kind === 'step') {
        parts.push(`<Step xsi:type="Step_t">${stepXml(b.step, p, id++)}</Step>`);
      } else {
        const children = b.steps.map((st) => `<Child xsi:type="Step_t">${stepXml(st, p, id++)}</Child>`).join('');
        parts.push(`<Step xsi:type="Repeat_t"><StepId>${id++}</StepId><Repetitions>${b.reps}</Repetitions>${children}</Step>`);
      }
    }
    const name = clean(`${w.short}${sess.title ? ` ${sess.title}` : ''}`);
    return `<Workout Sport="Running"><Name>${name}</Name>${parts.join('')}</Workout>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Workouts>${workouts.join('')}</Workouts></TrainingCenterDatabase>`;
}
