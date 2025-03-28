import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

export class Model3D {
  public mesh!: THREE.Group;
  private loader: GLTFLoader;

  constructor() {
    this.loader = new GLTFLoader();
  }

  async loadModel(path: string) {
    try {
      const gltf = await this.loader.loadAsync(path);
      this.mesh = gltf.scene;
      
      // Ajuster l'échelle et la position si nécessaire
      this.mesh.scale.set(1, 1, 1);
      this.mesh.position.set(0, 0, 0);
      
      return this.mesh;
    } catch (error) {
      console.error("Erreur lors du chargement du modèle:", error);
      throw error;
    }
  }
  changeScale(x: number, y: number, z: number) {
    this.mesh.scale.set(x, y, z);
  }
} 