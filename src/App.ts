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
      1000
    );
    this.camera.position.set(0, 0, -1);

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

    const planeShape = new CANNON.Box(new CANNON.Vec3(150, 150, 0.1)); // Largeur et longueur du sol
    this.planeBody = new CANNON.Body({
      mass: 0,
    }); // Static body
    this.planeBody.position.set(0, 5, 0); // Positionner le sol au centre
    this.planeBody.addShape(planeShape);
    this.planeBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Align with Three.js plane
    this.world.addBody(this.planeBody);
    // === Load 3D Models ===
    this.raceTrack = new Model3D();
    this.car = new Model3D();

    try {
      await this.raceTrack.loadModel(
        "/assets/track.glb"
      );
      console.log(this.raceTrack.mesh);
      await this.car.loadModel("/assets/astonMartin.glb");
      this.car.mesh.scale.set(8, 8, 8);
      this.raceTrack.mesh.scale.set(0.2, 0.2, 0.2);
      this.scene.add(this.raceTrack.mesh);
      this.scene.add(this.car.mesh);
      const child = this.raceTrack.mesh.getObjectByName("Cap_2_7_Mat1_0");
      if (!child) {
        console.error("L'objet Cap_2_7_Mat1_0 n'a pas été trouvé !");
      } else {
        // Cast child to Mesh to access geometry
        const mesh = child as THREE.Mesh;
        
        // 1️⃣ Récupérer les sommets (vertices) du modèle
        const vertices = mesh.geometry.attributes.position.array;
        const cannonVertices = [];

        // Convertir les vertices en Vec3 de Cannon.js
        for (let i = 0; i < vertices.length; i += 3) {
          cannonVertices.push(
            new CANNON.Vec3(
              vertices[i] * 0.2,
              vertices[i + 1] * 0.2,
              vertices[i + 2] * 0.2
            )
          );
        }

        // 2️⃣ Générer les faces (indices) à partir de la géométrie
        const indices = mesh.geometry.index ? mesh.geometry.index.array : [];
        const faces = [];
        
        // Créer des faces à partir des indices en inversant l'ordre pour corriger l'orientation
        for (let i = 0; i < indices.length; i += 3) {
          // Inverser l'ordre des indices pour corriger l'orientation des faces
          faces.push([indices[i], indices[i + 2], indices[i + 1]]);
        }

        // 3️⃣ Créer la forme ConvexPolyhedron avec les faces
        const shape = new CANNON.ConvexPolyhedron({
          vertices: cannonVertices,
          faces: faces,
        });

        // 4️⃣ Créer le body avec la collision
        this.raceTrackBody = new CANNON.Body({
          mass: 0, // 0 = Statique
          shape: shape,
        });

        // 5️⃣ Appliquer une rotation de -90° en X
        const rotationQuaternion = new CANNON.Quaternion();
        rotationQuaternion.setFromEuler(0, -Math.PI / 2, 0);
        this.raceTrackBody.quaternion.copy(rotationQuaternion);

        // 6️⃣ Positionner le body Cannon.js indépendamment du modèle Three.js
        this.raceTrackBody.position.set(0, 4, -45); // Position fixe pour le cannon
        
        this.world.addBody(this.raceTrackBody);
        console.log("Race Track Body created with vertices:", cannonVertices.length, "and faces:", faces.length);

        // 7️⃣ Synchroniser Cannon.js et Three.js dans la loop d'animation
        this.updatePhysics = () => {
          // Suppression de la synchronisation pour que le cannon soit indépendant
        };
      }

      // === Physics for Car ===
      const carShape = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 1)); // Adjust size
      this.carBody = new CANNON.Body({
        mass: 10,
        shape: carShape,
        position: new CANNON.Vec3(16, 15, -20), // Start above ground
      });
      this.world.addBody(this.carBody);

      // Ajuster la position de la voiture
      //  this.car.mesh.position.set(0, 10, 0);
    } catch (error) {
      console.error("Erreur lors du chargement des modèles:", error);
    }

    // === Add Cylinder for Mapping ===
   
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

    // === Race Track GUI Controls ===
    const raceTrackFolder = this.gui.addFolder("Race Track");

    // Race Track position controls
    const raceTrackPositionFolder = raceTrackFolder.addFolder("Position");
    raceTrackPositionFolder.add(this.raceTrackBody.position, "x", -50, 100).name("X");
    raceTrackPositionFolder.add(this.raceTrackBody.position, "y", -20, 20).name("Y");
    raceTrackPositionFolder.add(this.raceTrackBody.position, "z", -50, 100).name("Z");
    raceTrackPositionFolder.open();

    // Race Track rotation controls
    const raceTrackRotationFolder = raceTrackFolder.addFolder("Rotation");
    const raceTrackRotation = {
      x: 0,
      y: 0,
      z: 0
    };
    raceTrackRotationFolder.add(raceTrackRotation, "x", -Math.PI, Math.PI, 0.01).name("X").onChange((value: number) => {
      this.raceTrackBody.quaternion.setFromEuler(value, raceTrackRotation.y, raceTrackRotation.z);
    });
    raceTrackRotationFolder.add(raceTrackRotation, "y", -Math.PI, Math.PI, 0.01).name("Y").onChange((value: number) => {
      this.raceTrackBody.quaternion.setFromEuler(raceTrackRotation.x, value, raceTrackRotation.z);
    });
    raceTrackRotationFolder.add(raceTrackRotation, "z", -Math.PI, Math.PI, 0.01).name("Z").onChange((value: number) => {
      this.raceTrackBody.quaternion.setFromEuler(raceTrackRotation.x, raceTrackRotation.y, value);
    });
    raceTrackRotationFolder.open();

    // Reset race track position
    raceTrackFolder.add({ reset: () => {
      this.raceTrackBody.position.set(0, -5, -45);
      this.raceTrackBody.quaternion.setFromEuler(0, 0, 0);
      raceTrackRotation.x = 0;
      raceTrackRotation.y = 0;
      raceTrackRotation.z = 0;
    }}, "reset").name("Reset Race Track");
    
    raceTrackFolder.open();

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

    window.addEventListener("resize", this.onWindowResize.bind(this));
    window.addEventListener("keydown", this.handleKeyDown.bind(this));
    window.addEventListener("keyup", this.handleKeyUp.bind(this));
  }

  animate = () => {
    requestAnimationFrame(this.animate);
    this.world.step(1 / 60);
    this.stats.begin();

    // Update the car mesh position and rotation
    this.car.mesh.position.copy(this.carBody.position as any);
    this.car.mesh.quaternion.copy(this.carBody.quaternion as any);

    // Le modèle 3D de la track n'est plus synchronisé avec le cannon
    // this.raceTrack.mesh.position.copy(this.raceTrackBody.position as any);
    // this.raceTrack.mesh.quaternion.copy(this.raceTrackBody.quaternion as any);

    this.controls.update();

    // Update the debug renderer
    this.cannonDebugger.update();

    if (this.isFreeCamera) {
      this.handleCameraMovement(); // Déplacer la caméra librement
    } else {
      const direction = new THREE.Vector3();
      this.car.mesh.getWorldDirection(direction);

      const cameraOffset = direction.clone().multiplyScalar(-3); // Reculer de 3 unités
      cameraOffset.y += 1.5;

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
    const cameraSpeed = 0.5; // Vitesse de déplacement de la caméra

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
    const speed = 0.56; // Adjust speed as needed
    const turnSpeed = 0.02; // Vitesse de rotation (identique à votre code précédent)

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
          // Tourner à gauche (similaire à this.car.mesh.rotation.y += 0.02)
          const currentQuaternion = this.carBody.quaternion;
          const rotationQuaternion = new CANNON.Quaternion().setFromAxisAngle(
            new CANNON.Vec3(0, 1, 0), // Axe de rotation (vertical)
            -turnSpeed // Angle de rotation
          );

          // Multiplier le quaternion actuel par le quaternion de rotation
          currentQuaternion.mult(rotationQuaternion, currentQuaternion);
        }
        if (this.keys["d"]) {
          // Tourner à gauche (similaire à this.car.mesh.rotation.y += 0.02)
          const currentQuaternion = this.carBody.quaternion;
          const rotationQuaternion = new CANNON.Quaternion().setFromAxisAngle(
            new CANNON.Vec3(0, 1, 0), // Axe de rotation (vertical)
            turnSpeed // Angle de rotation
          );

          // Multiplier le quaternion actuel par le quaternion de rotation
          currentQuaternion.mult(rotationQuaternion, currentQuaternion);
        }
      } else {
        if (this.keys["q"]) {
          // Tourner à gauche (similaire à this.car.mesh.rotation.y += 0.02)
          const currentQuaternion = this.carBody.quaternion;
          const rotationQuaternion = new CANNON.Quaternion().setFromAxisAngle(
            new CANNON.Vec3(0, 1, 0), // Axe de rotation (vertical)
            turnSpeed // Angle de rotation
          );

          // Multiplier le quaternion actuel par le quaternion de rotation
          currentQuaternion.mult(rotationQuaternion, currentQuaternion);
        }
        if (this.keys["d"]) {
          // Tourner à gauche (similaire à this.car.mesh.rotation.y += 0.02)
          const currentQuaternion = this.carBody.quaternion;
          const rotationQuaternion = new CANNON.Quaternion().setFromAxisAngle(
            new CANNON.Vec3(0, 1, 0), // Axe de rotation (vertical)
            -turnSpeed // Angle de rotation
          );

          // Multiplier le quaternion actuel par le quaternion de rotation
          currentQuaternion.mult(rotationQuaternion, currentQuaternion);
        }
      }
    }
    this.handleCameraMovement(); // Appeler la méthode de mouvement de la caméra
  }

  // Méthode pour recharger l'instance
  private reloadInstance() {
    // Logique pour recharger l'instance
    window.location.reload(); // Recharger la page
  }

  private updateCylinderShape() {
    // Mettre à jour la forme du cylindre dans le monde physique
    this.world.removeBody(this.mapCylinderBody); // Retirer l'ancien corps
    const cylinderShape = new CANNON.Cylinder(
      this.cylinderRadius,
      this.cylinderRadius,
      this.cylinderHeight,
      32
    );
    this.mapCylinderBody = new CANNON.Body({ mass: 0 }); // Static body
    this.mapCylinderBody.addShape(cylinderShape);
    this.world.addBody(this.mapCylinderBody); // Ajouter le nouveau corps
  }
}
