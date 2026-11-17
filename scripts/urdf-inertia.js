import { Vector3 } from 'three';

// Accumulate mass, first moments and the symmetric second-moment matrix
// in link coordinates. Shift to the center of mass before forming inertia.
export class MassProperties {
  mass = 0;
  first = new Vector3();
  second = Array(6).fill(0);

  accumulate(mass, center, secondMoment) {
    this.mass += mass;
    this.first.addScaledVector(center, mass);
    for (let i = 0; i < pairs.length; i++) this.second[i] += mass * secondMoment(...pairs[i]);
  }

  box(center, size, rotation, density) {
    const edges = [new Vector3(size.x, 0, 0), new Vector3(0, size.y, 0), new Vector3(0, 0, size.z)];
    edges.forEach(v => v.applyQuaternion(rotation));
    this.accumulate(density * size.x * size.y * size.z, center,
      (i, j) => center[i] * center[j] + edges.reduce((s, u) => s + u[i] * u[j] / 12, 0));
  }

  // The oriented triangles of a closed mesh form signed tetrahedra with
  // the origin. The integral also subtracts holes such as a recessed pull.
  triangle(a, b, c, density) {
    const mass = density * a.dot(new Vector3().crossVectors(b, c)) / 6;
    const sum = a.clone().add(b).add(c);
    this.accumulate(mass, sum.clone().multiplyScalar(0.25),
      (i, j) => (sum[i] * sum[j] + a[i]*a[j] + b[i]*b[j] + c[i]*c[j]) / 20);
  }

  finish() {
    if (!(this.mass > 0)) throw new Error('URDF link needs positive mass');
    const center = this.first.clone().divideScalar(this.mass);
    const [xx, yy, zz, xy, xz, yz] = this.second.map((s, k) => {
      const [i, j] = pairs[k];
      return s - this.mass * center[i] * center[j];
    });
    return { center, mass: this.mass, ixx: yy + zz, iyy: xx + zz, izz: xx + yy, ixy: -xy, ixz: -xz, iyz: -yz };
  }
}
const pairs = [['x','x'], ['y','y'], ['z','z'], ['x','y'], ['x','z'], ['y','z']];
