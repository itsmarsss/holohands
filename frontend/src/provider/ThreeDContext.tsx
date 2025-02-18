import React, {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
} from "react";
import * as THREE from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";

interface ThreeDContextType {
    selectObject: (objectName: string) => void;
    setObjectVisibility: (objectName: string, visible: boolean) => void;
    registerObject: (
        objectName: string,
        object: THREE.Group<THREE.Object3DEventMap>
    ) => void;
    unregisterObject: (objectName: string) => void;
    setupScene: (mountRef: React.RefObject<HTMLDivElement>) => void;
    createCube: (
        objectName: string,
        position: THREE.Vector3,
        faceColor: number
    ) => THREE.Group;
    createSphere: (
        objectName: string,
        position: THREE.Vector3,
        radius: number,
        faceColor: number
    ) => THREE.Group;
    resetCamera: () => void;
    objectsRef: React.MutableRefObject<{
        [key: string]: THREE.Group<THREE.Object3DEventMap>;
    }>;
    renderScene: () => void;
    cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | undefined>;
    sceneRef: React.MutableRefObject<THREE.Scene>;
    mainGroupRef: React.MutableRefObject<THREE.Group>;
    rendererRef: React.MutableRefObject<THREE.WebGLRenderer>;
    cornerMarkersRef: React.MutableRefObject<THREE.Mesh[]>;
    zoomRef: React.MutableRefObject<number>;
    resetCameraRef: React.MutableRefObject<boolean>;
    renameObject: (oldName: string, newName: string) => void;
    updateCubeGeometry: (faceMesh: THREE.Mesh) => void;
    updateSphereGeometry: (sphereMesh: THREE.Mesh) => void;
}

const ThreeDContext = createContext<ThreeDContextType | null>(null);

export const ThreeDProvider: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const objectsRef = useRef<{
        [key: string]: THREE.Group<THREE.Object3DEventMap>;
    }>({});

    const rendererRef = useRef<THREE.WebGLRenderer>(
        new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: "high-performance",
        })
    );
    const cameraRef = useRef<THREE.PerspectiveCamera>();
    const sceneRef = useRef<THREE.Scene>(new THREE.Scene());
    const mainGroupRef = useRef<THREE.Group>(new THREE.Group());
    const cornerMarkersRef = useRef<THREE.Mesh[]>([]);

    const zoomRef = useRef(1);

    const resetCameraRef = useRef(false);

    const setupScene = (mountRef: React.RefObject<HTMLDivElement>) => {
        if (!mountRef.current) return;

        const width = mountRef.current.offsetWidth;
        const height = mountRef.current.offsetHeight;

        // Reset the everything bruh
        sceneRef.current = new THREE.Scene();
        mainGroupRef.current = new THREE.Group();
        cornerMarkersRef.current = [];
        objectsRef.current = {};

        rendererRef.current.setPixelRatio(window.devicePixelRatio);
        rendererRef.current.setSize(width, height);

        mountRef.current.appendChild(rendererRef.current.domElement);

        cameraRef.current = new THREE.PerspectiveCamera(
            75,
            width / height,
            0.1,
            1000
        );

        cameraRef.current.position.set(0, 3, 5);
        cameraRef.current.lookAt(0, 0, 0);

        // Create an infinite grid by using a large size and positioning it at the camera's height
        const gridHelper = new THREE.GridHelper(1000, 1000);
        mainGroupRef.current.add(gridHelper);

        createCube("cube-1", new THREE.Vector3(0, 0, 0), 0x00ff00);

        sceneRef.current.add(mainGroupRef.current);
    };

    const renderScene = () => {
        if (!rendererRef.current || !sceneRef.current || !cameraRef.current)
            return;

        rendererRef.current.render(sceneRef.current, cameraRef.current);
    };

    const createCube = (
        objectName: string,
        offset: THREE.Vector3,
        faceColor: number
    ): THREE.Group<THREE.Object3DEventMap> => {
        // Define the initial cube bounds.
        const min = new THREE.Vector3(-0.5, -0.5, -0.5);
        const max = new THREE.Vector3(0.5, 0.5, 0.5);
        // Create the eight corner vertices.
        const v0 = new THREE.Vector3(min.x, min.y, min.z);
        const v1 = new THREE.Vector3(min.x, min.y, max.z);
        const v2 = new THREE.Vector3(min.x, max.y, min.z);
        const v3 = new THREE.Vector3(min.x, max.y, max.z);
        const v4 = new THREE.Vector3(max.x, min.y, min.z);
        const v5 = new THREE.Vector3(max.x, min.y, max.z);
        const v6 = new THREE.Vector3(max.x, max.y, min.z);
        const v7 = new THREE.Vector3(max.x, max.y, max.z);
        const vertices = [v0, v1, v2, v3, v4, v5, v6, v7];

        // Build the initial geometry.
        const geometry = createHexahedronGeometry(vertices);

        // Create the face mesh.
        const faceMaterial = new THREE.MeshBasicMaterial({
            color: faceColor,
            opacity: 0.5,
            transparent: true,
        });
        const hexahredronMesh = new THREE.Mesh(geometry.clone(), faceMaterial);
        hexahredronMesh.name = "faceMesh";

        // Add eight corner markers to the face mesh.
        for (let i = 0; i < 8; i++) {
            const markerMaterial = new THREE.MeshBasicMaterial({
                color: 0x0000ff,
            });
            const marker = new THREE.Mesh(
                new THREE.SphereGeometry(0.05, 8, 8),
                markerMaterial
            );
            marker.position.copy(vertices[i]);
            marker.userData.isCornerMarker = true;
            marker.userData.cornerIndex = i;
            hexahredronMesh.add(marker);
            // Also add the marker to our global marker list.
            cornerMarkersRef.current.push(marker);
        }

        // Create a wireframe mesh from the same geometry.
        const wireframeGeom = new THREE.WireframeGeometry(geometry.clone());
        const wireframeMaterial = new THREE.LineBasicMaterial({
            color: 0x000000,
        });
        const wireframeMesh = new THREE.LineSegments(
            wireframeGeom,
            wireframeMaterial
        );
        wireframeMesh.name = "wireframeMesh";

        // Group the face mesh and the wireframe.
        const cubeGroup = new THREE.Group();
        cubeGroup.name = objectName;
        cubeGroup.add(hexahredronMesh);
        cubeGroup.add(wireframeMesh);
        cubeGroup.position.copy(offset);

        // Store an update function in the group's userData.
        cubeGroup.userData.updateGeometry = () => {
            console.log("Updating cube geometry");
            updateCubeGeometry(hexahredronMesh);
            const newWireframe = new THREE.WireframeGeometry(
                hexahredronMesh.geometry
            );
            wireframeMesh.geometry.dispose();
            wireframeMesh.geometry = newWireframe;
        };

        registerObject(objectName, cubeGroup);

        return cubeGroup;
    };

    const createHexahedronGeometry = (
        vertices: THREE.Vector3[]
    ): THREE.BufferGeometry => {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array([
            vertices[0].x,
            vertices[0].y,
            vertices[0].z,
            vertices[1].x,
            vertices[1].y,
            vertices[1].z,
            vertices[2].x,
            vertices[2].y,
            vertices[2].z,
            vertices[3].x,
            vertices[3].y,
            vertices[3].z,
            vertices[4].x,
            vertices[4].y,
            vertices[4].z,
            vertices[5].x,
            vertices[5].y,
            vertices[5].z,
            vertices[6].x,
            vertices[6].y,
            vertices[6].z,
            vertices[7].x,
            vertices[7].y,
            vertices[7].z,
        ]);
        geometry.setAttribute(
            "position",
            new THREE.BufferAttribute(positions, 3)
        );
        const indices = [
            0,
            1,
            3,
            0,
            3,
            2, // Face 1: markers 0,1,3,2
            4,
            6,
            7,
            4,
            7,
            5, // Face 2: markers 4,6,7,5
            0,
            4,
            5,
            0,
            5,
            1, // Face 3: markers 0,4,5,1
            2,
            3,
            7,
            2,
            7,
            6, // Face 4: markers 2,3,7,6
            0,
            2,
            6,
            0,
            6,
            4, // Face 5: markers 0,2,6,4
            1,
            5,
            7,
            1,
            7,
            3, // Face 6: markers 1,5,7,3
        ];
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        return geometry;
    };

    const updateCubeGeometry = (hexahredronMesh: THREE.Mesh) => {
        const markers = hexahredronMesh.children.filter(
            (child) => child.userData.isCornerMarker
        );
        if (markers.length !== 8) return; // safety check
        // Sort markers by their stored corner index.
        markers.sort((a, b) => a.userData.cornerIndex - b.userData.cornerIndex);
        // Extract target vertices from markers.
        const vertices = markers.map((marker) => marker.position.clone());
        const newGeometry = createHexahedronGeometry(vertices);
        hexahredronMesh.geometry.dispose();
        hexahredronMesh.geometry = newGeometry;
    };

    const selectObject = (objectName: string) => {
        const object = objectsRef.current[objectName];
        if (object && object.children[0] instanceof THREE.Mesh) {
            const faceMesh = object.children[0] as THREE.Mesh; // Casting to THREE.Mesh
            (faceMesh.material as THREE.MeshBasicMaterial).color.setHex(
                Math.random() * 0xffffff
            );
        }
    };

    const setObjectVisibility = (objectName: string, visible: boolean) => {
        const object = objectsRef.current[objectName];
        if (object) {
            object.visible = visible;
        }
    };

    const renameObject = (oldName: string, newName: string) => {
        const object = objectsRef.current[oldName];
        if (object) {
            // Update the object's name property.
            object.name = newName;
            // Re-key the object in objectsRef.
            objectsRef.current[newName] = object;
            delete objectsRef.current[oldName];
        }
    };

    const resetCamera = () => {
        resetCameraRef.current = true;

        if (!cameraRef.current) return;

        // Reset camera position & orientation.
        const newPos = new THREE.Vector3(0, 3, 5);
        cameraRef.current.position.copy(newPos);
        cameraRef.current.lookAt(0, 0, 0);
        cameraRef.current.updateProjectionMatrix();

        // Reset the main group's rotation and zoom.
        if (mainGroupRef.current) {
            mainGroupRef.current.rotation.set(0, 0, 0);
            mainGroupRef.current.scale.set(1, 1, 1);
        }

        // Reset zoom ref if used elsewhere.
        zoomRef.current = 1;

        // Force re-render the scene so the new settings take effect immediately.
        renderScene();
    };

    const registerObject = (
        objectName: string,
        object: THREE.Group<THREE.Object3DEventMap>
    ) => {
        objectsRef.current[objectName] = object;

        mainGroupRef.current.add(object);
    };

    const unregisterObject = (objectName: string) => {
        const object = objectsRef.current[objectName];

        if (object && sceneRef.current) {
            sceneRef.current.remove(object);
        }

        delete objectsRef.current[objectName];
        mainGroupRef.current.remove(object);
    };

    useEffect(() => {
        console.log(objectsRef.current);
    }, [objectsRef.current]);

    const createSphere = (
        objectName: string,
        position: THREE.Vector3,
        radius: number,
        faceColor: number
    ): THREE.Group => {
        // Create an editable icosphere using preset vertices.
        const t = (1 + Math.sqrt(5)) / 2;
        // Raw vertices for a regular icosahedron.
        const rawVertices = [
            new THREE.Vector3(-1, t, 0),
            new THREE.Vector3(1, t, 0),
            new THREE.Vector3(-1, -t, 0),
            new THREE.Vector3(1, -t, 0),
            new THREE.Vector3(0, -1, t),
            new THREE.Vector3(0, 1, t),
            new THREE.Vector3(0, -1, -t),
            new THREE.Vector3(0, 1, -t),
            new THREE.Vector3(t, 0, -1),
            new THREE.Vector3(t, 0, 1),
            new THREE.Vector3(-t, 0, -1),
            new THREE.Vector3(-t, 0, 1),
        ];

        // Normalize and scale each vertex to lie on a sphere of the given radius.
        const vertices = rawVertices.map((v) =>
            v.clone().normalize().multiplyScalar(radius)
        );

        // Create icosahedron geometry from the preset control points.
        const geometry = createIcosahedronGeometry(vertices);
        const faceMaterial = new THREE.MeshBasicMaterial({
            color: faceColor,
            opacity: 0.5,
            transparent: true,
        });
        const icosahedronMesh = new THREE.Mesh(geometry, faceMaterial);
        icosahedronMesh.name = "faceMesh";

        // Create control markers for each of the 12 vertices.
        for (let i = 0; i < 12; i++) {
            const markerMaterial = new THREE.MeshBasicMaterial({
                color: 0xff0000,
            });
            const marker = new THREE.Mesh(
                new THREE.SphereGeometry(0.05, 8, 8),
                markerMaterial
            );
            marker.position.copy(vertices[i]);
            marker.userData.isControlMarker = true;
            marker.userData.controlIndex = i;
            icosahedronMesh.add(marker);
            cornerMarkersRef.current.push(marker);
        }

        const wireframeGeom = new THREE.WireframeGeometry(geometry.clone());
        const wireframeMaterial = new THREE.LineBasicMaterial({
            color: 0x000000,
        });
        const wireframeMesh = new THREE.LineSegments(
            wireframeGeom,
            wireframeMaterial
        );
        wireframeMesh.name = "wireframeMesh";

        // Create a group and add the icosahedron mesh plus each control marker.
        const sphereGroup = new THREE.Group();
        sphereGroup.name = objectName;
        sphereGroup.add(icosahedronMesh);
        sphereGroup.add(wireframeMesh);
        sphereGroup.position.copy(position);

        // Provide an updateGeometry method to rebuild the mesh geometry from marker positions.
        sphereGroup.userData.updateGeometry = () => {
            console.log("Updating sphere geometry");
            updateIcosahedronGeometry(icosahedronMesh);
            const newWireframe = new THREE.WireframeGeometry(
                icosahedronMesh.geometry
            );
            wireframeMesh.geometry.dispose();
            wireframeMesh.geometry = newWireframe;
        };

        registerObject(objectName, sphereGroup);

        return sphereGroup;
    };

    const createIcosahedronGeometry = (
        vertices: THREE.Vector3[]
    ): THREE.BufferGeometry => {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(vertices.length * 3);
        for (let i = 0; i < vertices.length; i++) {
            positions[i * 3] = vertices[i].x;
            positions[i * 3 + 1] = vertices[i].y;
            positions[i * 3 + 2] = vertices[i].z;
        }
        geometry.setAttribute(
            "position",
            new THREE.BufferAttribute(positions, 3)
        );

        // Standard indices for a regular icosahedron (20 triangular faces).
        geometry.setIndex([
            0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4,
            11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3,
            8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
        ]);
        geometry.computeVertexNormals();
        return geometry;
    };

    const updateIcosahedronGeometry = (icosahedronMesh: THREE.Mesh) => {
        // Retrieve control markers stored in icosahedronMesh.userData.
        const markers = icosahedronMesh.children.filter(
            (child) => child.userData.isControlMarker
        );
        if (!markers || markers.length !== 12) return;

        // Sort markers by their stored control index.
        markers.sort(
            (a, b) => a.userData.controlIndex - b.userData.controlIndex
        );

        // Extract updated vertices from the markers.
        const vertices = markers.map((marker) => marker.position.clone());
        const newGeometry = createIcosahedronGeometry(vertices);
        icosahedronMesh.geometry.dispose();
        icosahedronMesh.geometry = newGeometry;
    };

    const threeDContextValue: ThreeDContextType = useMemo(() => {
        return {
            selectObject,
            setObjectVisibility,
            registerObject,
            unregisterObject,
            setupScene,
            createCube,
            createSphere,
            updateSphereGeometry: updateIcosahedronGeometry,
            resetCamera,
            objectsRef,
            renderScene,
            cameraRef,
            sceneRef,
            mainGroupRef,
            rendererRef,
            cornerMarkersRef,
            zoomRef,
            resetCameraRef,
            renameObject,
            updateCubeGeometry,
        };
    }, []);

    return (
        <ThreeDContext.Provider value={threeDContextValue}>
            {children}
        </ThreeDContext.Provider>
    );
};

export const useThreeD = () => {
    const context = useContext(ThreeDContext);
    if (!context) {
        throw new Error("useThreeD must be used within an ThreeDProvider");
    }
    return context;
};
