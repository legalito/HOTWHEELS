import * as THREE from 'three';

export class Cube {
  mesh: THREE.Mesh;

  constructor() {
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.x = -2;
  }
}
