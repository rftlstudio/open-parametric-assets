export const jointAt = (joint, op, val) => ({ joint: joint.name, op, val });
export const controlAt = (control, op, val) => ({ control: control.name, op, val });
export const pressed = c => controlAt(c, '==', true);
export function openingStates(joints, name) {
  return {
    [name]: { any: joints.map(j => jointAt(j, '>', 0.8)) },
    closed: { all: joints.map(j => jointAt(j, '<', 0.05)) }
  };
}

