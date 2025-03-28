import * as THREE from 'three';

export class Sphere {
  mesh: THREE.Mesh;

  constructor() {
    const geometry = new THREE.SphereGeometry(0.75, 32, 32);
    const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.x = 0;
  }
}
