import * as THREE from 'three';

export class Torus {
  mesh: THREE.Mesh;

  constructor() {
    const geometry = new THREE.TorusGeometry(0.7, 0.3, 16, 100);
    const material = new THREE.MeshLambertMaterial({ color: 0x0000ff });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.x = 2;
  }
}
