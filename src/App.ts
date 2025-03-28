import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import Stats from "stats.js";
import GUI from "lil-gui";

import { Cube } from "./objects/Cube";
import { Sphere } from "./objects/Sphere";
import { Torus } from "./objects/Torus";
import { Model3D } from "./objects/Model3D";

export class App {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private stats!: Stats;
  private gui!: GUI;

  private cube!: Cube;
  private sphere!: Sphere;
  private torus!: Torus;
  private raceTrack!: Model3D;
  private car!: Model3D;

  private keys: { [key: string]: boolean } = {};

  async init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x202020);

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

    // === OrbitControls ===
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    // === Lights ===
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    const directional = new THREE.DirectionalLight(0xffffff, 1);
    directional.position.set(5, 5, 5);
    this.scene.add(ambient, directional);

    // === Add Plane Geometry ===
    const planeGeometry = new THREE.PlaneGeometry(10, 10); // Dimensions du plan
    const planeMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, side: THREE.DoubleSide });
    const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);
    planeMesh.rotation.x = -Math.PI / 2; // Rotation pour que le plan soit horizontal
    this.scene.add(planeMesh); // Ajout du plan à la scène

    // === Load 3D Models ===
    this.raceTrack = new Model3D();
    this.car = new Model3D();
    
    try {
      //await this.raceTrack.loadModel("/assets/drift_race_track_free.glb");
      await this.car.loadModel("/assets/aston_martin_valkyrie.glb");
      this.car.mesh.scale.set(2.01, 2.01, 2.01);
      
      //this.scene.add(this.raceTrack.mesh);
      this.scene.add(this.car.mesh);
      this.car.mesh.scale.set(5, 5, 5);
      // Ajuster la position de la voiture
      this.car.mesh.position.set(0, 0, 0);
    } catch (error) {
      console.error("Erreur lors du chargement des modèles:", error);
    }

    // === Stats ===
    this.stats = new Stats();
    this.stats.showPanel(0); // 0: fps
    document.body.appendChild(this.stats.dom);

    // === GUI ===
    this.gui = new GUI();

    // === Car GUI Controls ===
    const carFolder = this.gui.addFolder("Car");
    
    // Position controls
    const positionFolder = carFolder.addFolder("Position");
    positionFolder.add(this.car.mesh.position, "x", -10, 10).name("X");
    positionFolder.add(this.car.mesh.position, "y", -10, 10).name("Y");
    positionFolder.add(this.car.mesh.position, "z", -10, 10).name("Z");
    
    // Rotation controls
    const rotationFolder = carFolder.addFolder("Rotation");
    rotationFolder.add(this.car.mesh.rotation, "x", -Math.PI, Math.PI).name("X");
    rotationFolder.add(this.car.mesh.rotation, "y", -Math.PI, Math.PI).name("Y");
    rotationFolder.add(this.car.mesh.rotation, "z", -Math.PI, Math.PI).name("Z");
    
    // Scale controls
    const scaleFolder = carFolder.addFolder("Scale");
    scaleFolder.add(this.car.mesh.scale, "x", 0.1, 5).name("X");
    scaleFolder.add(this.car.mesh.scale, "y", 0.1, 5).name("Y");
    scaleFolder.add(this.car.mesh.scale, "z", 0.1, 5).name("Z");
    
    carFolder.open();

    // === Camera GUI Controls ===
    const cameraFolder = this.gui.addFolder("Camera");
    
    // Position controls
    const cameraPositionFolder = cameraFolder.addFolder("Position");
    cameraPositionFolder.add(this.camera.position, "x", -50, 50).name("X");
    cameraPositionFolder.add(this.camera.position, "y", 0, 50).name("Y");
    cameraPositionFolder.add(this.camera.position, "z", -50, 50).name("Z");
    
    cameraFolder.open();

    this.gui.add({ test: () => console.log("Test") }, "test").name("Test Button");

    window.addEventListener("resize", this.onWindowResize.bind(this));
    window.addEventListener("keydown", this.handleKeyDown.bind(this));
    window.addEventListener("keyup", this.handleKeyUp.bind(this));
  }


  animate = () => {
    requestAnimationFrame(this.animate);

    this.stats.begin();

    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    // Positionner la caméra derrière la voiture
    const offset = new THREE.Vector3(0, 2, -5); // Ajustez ces valeurs pour la distance et la hauteur
    this.camera.position.copy(this.car.mesh.position).add(offset); // Suivre la voiture avec un décalage

    // Faire en sorte que la caméra regarde toujours la voiture
    this.camera.lookAt(this.car.mesh.position.clone().add(new THREE.Vector3(0, 0, 0))); // Regarder la voiture

    this.controlCar();

    this.stats.end();
  };

  private onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private handleKeyDown(event: KeyboardEvent) {
    this.keys[event.key] = true;
  }

  private handleKeyUp(event: KeyboardEvent) {
    this.keys[event.key] = false;
  }

  private controlCar() {
    const speed = 0.05;

    // Calculer la direction avant de la voiture
    const direction = new THREE.Vector3();
    this.car.mesh.getWorldDirection(direction); // Obtenir la direction avant de la voiture

    // Avancer et reculer selon la direction de la voiture
    if (this.keys["z"]) {
      this.car.mesh.position.add(direction.multiplyScalar(speed)); // Avancer
    }
    if (this.keys["s"]) {
      this.car.mesh.position.add(direction.multiplyScalar(-speed)); // Reculer
    }

    // Ne permettre la rotation que si la voiture est en mouvement
    if (this.keys["z"] || this.keys["s"]) {
      if (this.keys["q"]) {
        this.car.mesh.rotation.y += 0.02; // Tourner à gauche
      }
      if (this.keys["d"]) {
        this.car.mesh.rotation.y -= 0.02; // Tourner à droite
      }
    }
  }
}
