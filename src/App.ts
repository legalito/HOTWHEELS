import * as THREE from "three";
import * as CANNON from "cannon-es";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import Stats from "stats.js";
import GUI from "lil-gui";
import CannonDebugger from "cannon-es-debugger";

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

  private world!: CANNON.World;

  private cube!: Cube;
  private sphere!: Sphere;
  private torus!: Torus;
  private raceTrack!: Model3D;
  private car!: Model3D;

  private carBody!: CANNON.Body;
  private planeBody!: CANNON.Body;

  private keys: { [key: string]: boolean } = {};

  private cameraOffset!: THREE.Object3D; // Déclaration du conteneur pour la caméra

  private currentSpeed: number = 0; // Vitesse actuelle de la voiture
  private maxSpeed: number = 0.2; // Vitesse maximale
  private acceleration: number = 0.01; // Taux d'accélération
  private deceleration: number = 0.02; // Taux de décélération
  private gravity: number = -0.01; // Force de gravité
  private isOnGround: boolean = true; // État de la voiture par rapport au sol

  private cannonDebugger!: CannonDebugger; // Declare cannonDebugger as a class property

  private raceTrackBody!: CANNON.Body; // Declare raceTrackBody

  private isFreeCamera: boolean = false; // État de la caméra libre

  private mapCylinderBody!: CANNON.Body; // Déclaration du corps du cylindre pour mapper la carte

  private cylinderRadius: number = 27; // Rayon du cylindre
  private cylinderHeight: number = 75; // Hauteur du cylindre

  private updatePhysics!: () => void; // Declare updatePhysics as a method property

  private clock = new THREE.Clock();

  private isLowQuality: boolean = false;

  // Ajouter une propriété pour contrôler la densité des corps physiques
  private physicsDensity: number = 1.0; // 1.0 = tous les objets, 0.5 = la moitié, etc.

  // Ajouter une propriété pour l'intervalle de mise à jour physique
  private physicsStepFrequency: number = 60; // Hz

  // Ajouter une propriété pour contrôler la distance de rendu
  private renderDistance: number = 1000;

  private frontWheelLeft!: THREE.Object3D;
  private frontWheelRight!: THREE.Object3D;
  private rearWheelLeft!: THREE.Object3D;
  private rearWheelRight!: THREE.Object3D;
  private wheelRotationSpeed: number = 0.1; // Vitesse de rotation des roues

  async init() {
    // === Physics World Setup ===
    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.82, 0); // Gravité réaliste
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x202020);

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      this.isLowQuality ? 500 : 1000
    );
    this.camera.position.set(0, 0, -1);

    this.renderer = new THREE.WebGLRenderer({ 
      antialias: !this.isLowQuality 
    });
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

    const planeShape = new CANNON.Box(new CANNON.Vec3(1050, 1050, 0.1)); // Largeur et longueur du sol
    this.planeBody = new CANNON.Body({
      mass: 0,
    }); // Static body
    this.planeBody.position.set(0, -0.5, 0); // Positionner le sol au centre
    this.planeBody.addShape(planeShape);
    this.planeBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Align with Three.js plane
    this.world.addBody(this.planeBody);
    // === Load 3D Models ===
    this.raceTrack = new Model3D();
    this.car = new Model3D();

    try {
      await this.raceTrack.loadModel(
        "/assets/scene.gltf"
      );
      console.log(this.raceTrack.mesh);
      await this.car.loadModel("/assets/voiture.glb");
      this.car.mesh.scale.set(0.01, 0.01, 0.01);
      this.scene.add(this.raceTrack.mesh);
      this.scene.add(this.car.mesh);
      // Create CANNON bodies from each mesh in the track model
      this.raceTrack.mesh.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) {
          // Vérifier si le maillage a une géométrie
          if (child.geometry) {
            // Vérifier les différents types d'objets qui nécessitent des boîtes de collision
            const isIcosphere = child.name.includes('Icosphere00');
            const isStorage = child.name.includes('Storage');
            const isOilBarrel = child.name.includes('OilBarrel0');
            const isThree = child.name.includes('Tree0');
            const isBaseThree = child.name.includes('Base_Tree0');
            
            // Log pour le débogage
           
            
            // Créer un corps physique pour ce maillage avec un type spécifique 
            // pour les objets qui nécessitent des boîtes de collision
            if (isIcosphere || isStorage || isOilBarrel || isThree || isBaseThree) {
              if (Math.random() > this.physicsDensity) {
                return; // Ignorer certains objets selon la densité configurée
              }
              this.createPhysicsBodyFromMesh(child, this.raceTrack.mesh.scale, 'box');
            } else {
              this.createPhysicsBodyFromMesh(child, this.raceTrack.mesh.scale);
            }
          }
        }
      });
      

      // === Physics for Car ===
      const carShape = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 1)); // Adjust size
      this.carBody = new CANNON.Body({
        mass: 10,
        shape: carShape,
        position: new CANNON.Vec3(-3, 15, -20), // Start above ground
      });
      this.world.addBody(this.carBody);

      // Ajuster la position de la voiture
      //  this.car.mesh.position.set(0, 10, 0);

      // Trouver les roues dans le modèle de la voiture
      this.car.mesh.traverse((child) => {
        if (child) {
          console.log(child.name);
          if (child.name === "Front_wheel" && !child.name.includes("001")) {
          
            this.frontWheelLeft = child;
            console.log("Roue avant gauche trouvée:", child.name);
          } else if (child.name === "Front_wheel001") {
            this.frontWheelRight = child;
            console.log("Roue avant droite trouvée:", child.name);
          } else if (child.name === "Rear_wheel" && !child.name.includes("001")) {
            this.rearWheelLeft = child;
            console.log("Roue arrière gauche trouvée:", child.name);
          } else if (child.name === "Rear_wheel001") {
            this.rearWheelRight = child;
            console.log("Roue arrière droite trouvée:", child.name);
          }
        }
      });
    } catch (error) {
      console.error("Erreur lors du chargement des modèles:", error);
    }

    // === Stats ===
    this.stats = new Stats();
    this.stats.showPanel(0); // 0: fps
    document.body.appendChild(this.stats.dom);

    // === GUI ===
    this.gui = new GUI();

    // === Camera GUI Controls ===
    const cameraFolder = this.gui.addFolder("Camera");

    // Position controls
    const cameraPositionFolder = cameraFolder.addFolder("Position");
    cameraPositionFolder.add(this.camera.position, "x", -50, 50).name("X");
    cameraPositionFolder.add(this.camera.position, "y", 0, 150).name("Y");
    cameraPositionFolder.add(this.camera.position, "z", -50, 50).name("Z");
    cameraPositionFolder.open();

    // Toggle free camera
    cameraFolder
      .add(this, "isFreeCamera")
      .name("Free Camera")
      .onChange((value) => {
        if (value) {
          console.log("Free camera mode activated");
        } else {
          console.log("Free camera mode deactivated");
        }
      });

    // Zoom controls
    cameraFolder
      .add(this.camera, "fov", 1, 180)
      .name("Field of View")
      .onChange(() => {
        this.camera.updateProjectionMatrix(); // Mettre à jour la matrice de projection
      });

    // Reset camera position
    cameraFolder.add({ reset: () => {} }, "reset").name("Reset Camera");
    cameraFolder.open();

    // === Car GUI Controls ===
    const carFolder = this.gui.addFolder("Car");

    // Car position controls
    const carPositionFolder = carFolder.addFolder("Position");
    carPositionFolder.add(this.carBody.position, "x", -50, 50).name("X");
    carPositionFolder.add(this.carBody.position, "y", 0, 20).name("Y");
    carPositionFolder.add(this.carBody.position, "z", -50, 50).name("Z");
    carPositionFolder.open();

    // Car speed controls
    const carSpeedFolder = carFolder.addFolder("Speed");
    const carSpeedControls = {
      maxSpeed: this.maxSpeed,
      acceleration: this.acceleration,
      deceleration: this.deceleration
    };
    carSpeedFolder.add(carSpeedControls, "maxSpeed", 0.1, 1, 0.05).name("Max Speed").onChange((value: number) => {
      this.maxSpeed = value;
    });
    carSpeedFolder.add(carSpeedControls, "acceleration", 0.005, 0.05, 0.001).name("Acceleration").onChange((value: number) => {
      this.acceleration = value;
    });
    carSpeedFolder.add(carSpeedControls, "deceleration", 0.01, 0.1, 0.005).name("Deceleration").onChange((value: number) => {
      this.deceleration = value;
    });
    carSpeedFolder.add(this, "wheelRotationSpeed", 0.05, 0.5, 0.05).name("Vitesse rotation roues");
    carSpeedFolder.open();

    // Car physics controls
    const carPhysicsFolder = carFolder.addFolder("Physics");
    const carPhysicsControls = {
      gravity: this.gravity
    };
    carPhysicsFolder.add(carPhysicsControls, "gravity", -0.05, 0, 0.005).name("Gravity").onChange((value: number) => {
      this.gravity = value;
    });
    carPhysicsFolder.add(this.carBody, "mass", 1, 20, 0.5).name("Mass");
    carPhysicsFolder.open();

    // Reset car position
    carFolder.add({ reset: () => {
      this.carBody.position.set(0, 5, 0);
      this.carBody.velocity.set(0, 0, 0);
      this.carBody.angularVelocity.set(0, 0, 0);
    }}, "reset").name("Reset Car");
    
    carFolder.open();

    
    // === Plane Body GUI Controls ===
    const planeFolder = this.gui.addFolder("Plane");

    // Plane position controls
    const planePositionFolder = planeFolder.addFolder("Position");
    planePositionFolder.add(this.planeBody.position, "x", -50, 50).name("X");
    planePositionFolder.add(this.planeBody.position, "y", -20, 20).name("Y");
    planePositionFolder.add(this.planeBody.position, "z", -50, 50).name("Z");
    planePositionFolder.open();

    // Plane rotation controls
    const planeRotationFolder = planeFolder.addFolder("Rotation");
    const planeRotation = {
      x: -Math.PI / 2,
      y: 0,
      z: 0
    };
    planeRotationFolder.add(planeRotation, "x", -Math.PI, Math.PI, 0.01).name("X").onChange((value: number) => {
      this.planeBody.quaternion.setFromEuler(value, planeRotation.y, planeRotation.z);
    });
    planeRotationFolder.add(planeRotation, "y", -Math.PI, Math.PI, 0.01).name("Y").onChange((value: number) => {
      this.planeBody.quaternion.setFromEuler(planeRotation.x, value, planeRotation.z);
    });
    planeRotationFolder.add(planeRotation, "z", -Math.PI, Math.PI, 0.01).name("Z").onChange((value: number) => {
      this.planeBody.quaternion.setFromEuler(planeRotation.x, planeRotation.y, value);
    });
    planeRotationFolder.open();

    // Reset plane position
    planeFolder.add({ reset: () => {
      this.planeBody.position.set(0, 0, 0);
      this.planeBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
      planeRotation.x = -Math.PI / 2;
      planeRotation.y = 0;
      planeRotation.z = 0;
    }}, "reset").name("Reset Plane");
    
    planeFolder.open();

    // === Debugger Setup ===
    this.cannonDebugger = new CannonDebugger(this.scene, this.world, {
      color: 0xff0000, // Optional: Set the color of the debug meshes
      scale: 1, // Optional: Set the scale of the debug meshes
    });

    // === Performance GUI Controls ===
    const qualityFolder = this.gui.addFolder("Performance");
    qualityFolder.add(this, "isLowQuality").name("Mode basse qualité").onChange(() => {
      // Recréer le renderer avec les nouveaux paramètres
      document.body.removeChild(this.renderer.domElement);
      this.renderer = new THREE.WebGLRenderer({ antialias: !this.isLowQuality });
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      document.body.appendChild(this.renderer.domElement);
    });

    // Ajouter un contrôle pour le facteur de résolution
    const resolutionScale = { value: 1.0 };
    qualityFolder.add(resolutionScale, "value", 0.5, 1.0, 0.1).name("Échelle résolution").onChange((value) => {
      this.renderer.setSize(window.innerWidth * value, window.innerHeight * value, false);
    });
    qualityFolder.open();

    // Dans le GUI
    const physicsFolder = this.gui.addFolder("Physics");
    physicsFolder.add(this, "physicsStepFrequency", 30, 60, 10).name("Fréquence physique (Hz)");

    // Dans le GUI
    qualityFolder.add(this, "renderDistance", 100, 1000, 100).name("Distance de rendu").onChange((value) => {
      this.camera.far = value;
      this.camera.updateProjectionMatrix();
    });

    window.addEventListener("resize", this.onWindowResize.bind(this));
    window.addEventListener("keydown", this.handleKeyDown.bind(this));
    window.addEventListener("keyup", this.handleKeyUp.bind(this));
  }

  animate = () => {
    requestAnimationFrame(this.animate);
    
    // Calculer le delta time
    const delta = this.clock.getDelta();
    
    // Mettre à jour les animations
    if (this.car && this.car.mixer) {
      this.car.updateAnimation(delta);
    }
    if (this.raceTrack && this.raceTrack.mixer) {
      this.raceTrack.updateAnimation(delta);
    }

    this.world.step(1 / this.physicsStepFrequency);
    // this.stats.begin();
  
    // Update the car mesh position and rotation
    this.car.mesh.position.copy(this.carBody.position as any);
    this.car.mesh.quaternion.copy(this.carBody.quaternion as any);

    // Le modèle 3D de la track n'est plus synchronisé avec le cannon
    // this.raceTrack.mesh.position.copy(this.raceTrackBody.position as any);
    // this.raceTrack.mesh.quaternion.copy(this.raceTrackBody.quaternion as any);

    this.controls.update();

    // Update the debug renderer
    // this.cannonDebugger.update();

    if (this.isFreeCamera) {
      this.handleCameraMovement(); // Déplacer la caméra librement
    } else {
      const direction = new THREE.Vector3();
      this.car.mesh.getWorldDirection(direction);

      const cameraOffset = direction.clone().multiplyScalar(-10); // Reculer la caméra
      cameraOffset.y += 10; // Augmenter la hauteur pour une meilleure vue d'ensemble

      const cameraPosition = this.car.mesh.position.clone().add(cameraOffset);
      this.camera.position.copy(cameraPosition);
      this.camera.lookAt(
        this.car.mesh.position.clone().add(direction.multiplyScalar(10))
      );
    }

    this.controlCar();
    this.renderer.render(this.scene, this.camera);

    this.stats.end();
  };

  private onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private handleKeyDown(event: KeyboardEvent) {
    this.keys[event.key] = true;
    if (event.key === "r") {
      this.reloadInstance(); // Recharger l'instance
    }
  }

  private handleKeyUp(event: KeyboardEvent) {
    this.keys[event.key] = false;
  }

  private handleCameraMovement() {
    const cameraSpeed = 1.5; // Vitesse de déplacement de la caméra

    if (this.keys["ArrowUp"]) {
      this.camera.position.z += cameraSpeed; // Déplacer la caméra vers l'avant
    }
    if (this.keys["ArrowDown"]) {
      this.camera.position.z -= cameraSpeed; // Déplacer la caméra vers l'arrière
    }
    if (this.keys["ArrowLeft"]) {
      this.camera.position.x -= cameraSpeed; // Déplacer la caméra vers la gauche
    }
    if (this.keys["ArrowRight"]) {
      this.camera.position.x += cameraSpeed; // Déplacer la caméra vers la droite
    }
    if (this.keys["PageUp"]) {
      this.camera.position.y += cameraSpeed; // Déplacer la caméra vers le haut
    }
    if (this.keys["PageDown"]) {
      this.camera.position.y -= cameraSpeed; // Déplacer la caméra vers le bas
    }
  }

  private controlCar() {
    const speed = 0.1; // Adjust speed as needed
    const turnSpeed = 0.03; // Vitesse de rotation (identique à votre code précédent)
    const wheelTurnAngle = 0.2; // Angle de rotation des roues avant

    // Calculate the forward direction of the car
    const direction = new THREE.Vector3();
    this.car.mesh.getWorldDirection(direction); // Get the forward direction of the car
    direction.y = 0; // Ignore the Y component for horizontal movement
    direction.normalize(); // Normalize the direction

    // Move forward and backward based on the car's direction
    if (this.keys["z"]) {
      direction.multiplyScalar(speed);
      this.carBody.position.vadd(
        new CANNON.Vec3(direction.x, direction.y, direction.z),
        this.carBody.position
      ); // Move forward
    }
    if (this.keys["s"]) {
      direction.multiplyScalar(-1 * speed);
      this.carBody.position.vadd(
        new CANNON.Vec3(direction.x, direction.y, direction.z),
        this.carBody.position
      ); // Move backward
    }

    // Adjust the car's position to ensure it touches the plane
    if (this.carBody.position.y < 0) {
      this.carBody.position.y = 0; // Ensure the car does not go below the plane
    }

    // Rotation
    if (this.keys["z"] || this.keys["s"]) {
      if (this.keys["s"]) {
        if (this.keys["q"]) {
          // Tourner à gauche
          const currentQuaternion = this.carBody.quaternion;
          const rotationQuaternion = new CANNON.Quaternion().setFromAxisAngle(
            new CANNON.Vec3(0, 1, 0), // Axe de rotation (vertical)
            -turnSpeed // Angle de rotation
          );
          currentQuaternion.mult(rotationQuaternion, currentQuaternion);
        }
        if (this.keys["d"]) {
          // Tourner à droite
          const currentQuaternion = this.carBody.quaternion;
          const rotationQuaternion = new CANNON.Quaternion().setFromAxisAngle(
            new CANNON.Vec3(0, 1, 0), // Axe de rotation (vertical)
            turnSpeed // Angle de rotation
          );
          currentQuaternion.mult(rotationQuaternion, currentQuaternion);
        }
      } else {
        if (this.keys["q"]) {
          // Tourner à gauche
          const currentQuaternion = this.carBody.quaternion;
          const rotationQuaternion = new CANNON.Quaternion().setFromAxisAngle(
            new CANNON.Vec3(0, 1, 0), // Axe de rotation (vertical)
            turnSpeed // Angle de rotation
          );
          currentQuaternion.mult(rotationQuaternion, currentQuaternion);
        }
        if (this.keys["d"]) {
          // Tourner à droite
          const currentQuaternion = this.carBody.quaternion;
          const rotationQuaternion = new CANNON.Quaternion().setFromAxisAngle(
            new CANNON.Vec3(0, 1, 0), // Axe de rotation (vertical)
            -turnSpeed // Angle de rotation
          );
          currentQuaternion.mult(rotationQuaternion, currentQuaternion);
        }
      }
    }

    // Faire tourner les roues seulement si on avance ou recule
    if (this.keys["z"] || this.keys["s"]) {
      // Calculer la vitesse de rotation des roues
      const wheelRotation = this.keys["z"] ? this.wheelRotationSpeed : -this.wheelRotationSpeed;
      
      // Faire tourner les roues si elles existent
      if (this.frontWheelLeft) {
        this.frontWheelLeft.rotation.z += wheelRotation;
        // Pivoter les roues avant selon la direction
        if (this.keys["q"]) {
          this.frontWheelLeft.rotation.y = wheelTurnAngle;
        } else if (this.keys["d"]) {
          this.frontWheelLeft.rotation.y = -wheelTurnAngle;
        } else {
          this.frontWheelLeft.rotation.y = 0;
        }
      }
      if (this.frontWheelRight) {
        this.frontWheelRight.rotation.z += wheelRotation;
        // Pivoter les roues avant selon la direction
        if (this.keys["q"]) {
          this.frontWheelRight.rotation.y = -wheelTurnAngle;
        } else if (this.keys["d"]) {
          this.frontWheelRight.rotation.y = wheelTurnAngle;
        } else {
          this.frontWheelRight.rotation.y = 0;
        }
      }
      if (this.rearWheelLeft) {
        this.rearWheelLeft.rotation.z += wheelRotation;
      }
      if (this.rearWheelRight) {
        this.rearWheelRight.rotation.z += wheelRotation;
      }
    }

    this.handleCameraMovement(); // Appeler la méthode de mouvement de la caméra
  }

  // Méthode pour recharger l'instance
  private reloadInstance() {
    // Logique pour recharger l'instance
    window.location.reload(); // Recharger la page
  }

  // Méthode pour créer un corps physique à partir d'un maillage Three.js
  private createPhysicsBodyFromMesh(mesh: THREE.Mesh, parentScale?: THREE.Vector3, forceType?: string) {
    // Forcer la mise à jour de la matrice mondiale pour garantir des positions correctes
    mesh.updateMatrixWorld(true);
    
    // Obtenir la position mondiale et la rotation du maillage
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    
    mesh.matrixWorld.decompose(position, quaternion, scale);
    
    // Si une échelle parentale est fournie, l'appliquer également
    if (parentScale) {
      scale.multiply(parentScale);
    }
    
    // Cloner la géométrie pour éviter de modifier l'original
    const geometry = mesh.geometry.clone();
    
    // S'assurer que la géométrie est non-indexée pour un accès facile aux sommets
    if (geometry.index !== null) {
      geometry.toNonIndexed();
    }
    
    // Obtenir les positions des sommets
    const positions = geometry.attributes.position.array;
    
    if (positions.length <= 0) {
      console.warn("Géométrie sans sommets détectée, ignorée");
      return;
    }
    
    // Créer un trimesh (maillage triangulaire) Cannon
    const vertices: number[] = [];
    const indices: number[] = [];
    
    // Extraire les sommets en appliquant l'échelle
    for (let i = 0; i < positions.length; i += 3) {
      vertices.push(
        positions[i] * scale.x,
        positions[i + 1] * scale.y,
        positions[i + 2] * scale.z
      );
    }
    
    // Créer des indices pour les triangles
    for (let i = 0; i < vertices.length / 3; i += 3) {
      indices.push(i, i + 1, i + 2);
    }
    
    // Pour les grands modèles comme le circuit, utiliser une forme simplifiée au lieu d'un trimesh complet
    let body: CANNON.Body;
    
    // Calculer les dimensions de la boîte englobante (nécessaire quel que soit le type)
    const bbox = new THREE.Box3().setFromBufferAttribute(geometry.attributes.position);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    
    // Calculer le centre de la boîte englobante par rapport à l'origine
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    
    // Appliquer l'échelle aux dimensions
    size.multiply(scale).multiplyScalar(0.5); // Demi-dimensions pour Cannon.Box
    
    // Utiliser une boîte pour plus d'objets
    if (forceType === 'box' || vertices.length > 1000) {
      // Log pour les icospheres
      if (forceType === 'box') {
      }
      
      const boxShape = new CANNON.Box(new CANNON.Vec3(size.x, size.y, size.z));
      body = new CANNON.Body({ mass: 0 }); // Statique
      
      // Ajouter la forme avec un offset correspondant au centre relatif
      const centerOffset = new CANNON.Vec3(
        center.x * scale.x,
        center.y * scale.y,
        center.z * scale.z
      );
      body.addShape(boxShape, centerOffset);
    } else {
      // Pour les petits objets, utiliser un trimesh
      const trimesh = new CANNON.Trimesh(vertices, indices);
      body = new CANNON.Body({ mass: 0 }); // Statique
      body.addShape(trimesh);
    }
    
    // Positionner le corps
    body.position.set(position.x, position.y, position.z);
    body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    
    // Ajustement pour corriger le décalage
    body.position.y += 0.01; // Légère élévation pour éviter les problèmes de z-fighting
    
    // Pour les icosphères, rendre le corps physique plus réactif aux collisions
    if (forceType === 'box') {
      body.collisionFilterGroup = 2; // Groupe spécial pour les icosphères
      body.collisionFilterMask = 1; // Ne collisionne qu'avec le groupe 1 (la voiture)
      
      // Pour améliorer les performances de collision
      body.collisionResponse = 1; // Activer la réponse à la collision
      body.material = new CANNON.Material({ friction: 0.3, restitution: 0.4 }); // Matériau avec frottement modéré
    }
    
    // Ajouter le corps au monde physique
    this.world.addBody(body);
    
    return body;
  }
}
