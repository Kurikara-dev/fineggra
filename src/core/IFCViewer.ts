import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  DirectionalLight,
  AmbientLight,
  GridHelper,
  AxesHelper,
  Raycaster,
  Vector2,
  Vector3,
  Object3D,
  Box3,
  MeshLambertMaterial,
  Color
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { IFCLoader } from 'web-ifc-three/IFCLoader'
import { IFCSPACE } from 'web-ifc'
import { LODManager } from './LODManager'
import type {
  ViewerConfig,
  IFCModel,
  SelectedObject,
  ViewerState,
  CameraState,
  IFCProperty
} from '../types'

export class IFCViewer {
  private scene: Scene
  private camera: PerspectiveCamera
  private renderer: WebGLRenderer
  private controls: OrbitControls
  private ifcLoader: IFCLoader
  private raycaster: Raycaster
  private mouse: Vector2
  private lodManager: LODManager
  
  private state: ViewerState = {
    models: [],
    selectedObject: null,
    cameraState: {
      position: [10, 10, 10],
      target: [0, 0, 0],
      zoom: 1
    },
    wireframeMode: false,
    lodLevel: 0
  }
  
  private eventListeners: Map<string, Function[]> = new Map()
  
  constructor(private config: ViewerConfig) {
    this.scene = new Scene()
    this.camera = new PerspectiveCamera(75, 1, 0.1, 1000)
    
    const canvas = config.container.querySelector('canvas') as HTMLCanvasElement
    if (!canvas) {
      throw new Error('Canvas element not found in container')
    }
    
    this.renderer = new WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: false
    })
    
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.ifcLoader = new IFCLoader()
    this.raycaster = new Raycaster()
    this.mouse = new Vector2()
    this.lodManager = new LODManager()
    
    this.init()
  }
  
  private init(): void {
    this.setupRenderer()
    this.setupScene()
    this.setupCamera()
    this.setupControls()
    this.setupEventListeners()
    
    // Setup IFC loader asynchronously
    this.setupIFCLoader().catch(error => {
      console.error('Failed to setup IFC loader:', error)
    })
    
    this.animate()
  }
  
  private setupRenderer(): void {
    const container = this.config.container
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.setClearColor(0x1a1a1a, 1)
    
    // Canvas is already in the container, just ensure it's properly configured
    const canvas = this.renderer.domElement
    canvas.style.display = 'block'
    canvas.style.outline = 'none'
    
    window.addEventListener('resize', this.handleResize.bind(this))
  }
  
  private setupScene(): void {
    const ambientLight = new AmbientLight(0x404040, 0.6)
    this.scene.add(ambientLight)
    
    const directionalLight = new DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(50, 50, 50)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.width = 2048
    directionalLight.shadow.mapSize.height = 2048
    this.scene.add(directionalLight)
    
    const gridHelper = new GridHelper(20, 20, 0x444444, 0x222222)
    this.scene.add(gridHelper)
    
    const axesHelper = new AxesHelper(5)
    this.scene.add(axesHelper)
  }
  
  private setupCamera(): void {
    this.camera.position.set(...this.state.cameraState.position)
    this.camera.lookAt(...this.state.cameraState.target)
  }
  
  private setupControls(): void {
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.screenSpacePanning = false
    this.controls.minDistance = 1
    this.controls.maxDistance = 1000
    this.controls.maxPolarAngle = Math.PI
    
    this.controls.addEventListener('change', () => {
      this.updateCameraState()
    })
  }
  
  private setupEventListeners(): void {
    if (this.config.enableSelection) {
      this.renderer.domElement.addEventListener('click', this.handleClick.bind(this))
    }
  }
  
  private async setupIFCLoader(): Promise<void> {
    try {
      console.log('Setting up IFC loader...')
      await this.ifcLoader.ifcManager.setWasmPath('/wasm/')
      console.log('WASM path set successfully')
      
      // Setup BVH for better performance
      await this.ifcLoader.ifcManager.setupThreeMeshBVH()
      console.log('ThreeMeshBVH setup complete')
      
      // Apply web-ifc configuration
      this.ifcLoader.ifcManager.applyWebIfcConfig({
        COORDINATE_TO_ORIGIN: true,
        USE_FAST_BOOLS: false  // Disable fast bools to avoid potential issues
      })
      console.log('WebIFC config applied')
      
    } catch (error) {
      console.error('Error setting up IFC loader:', error)
      throw error
    }
  }
  
  private handleResize(): void {
    const container = this.config.container
    const width = container.clientWidth
    const height = container.clientHeight
    
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }
  
  private handleClick(event: MouseEvent): void {
    if (!this.config.enableSelection) return
    
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    
    this.raycaster.setFromCamera(this.mouse, this.camera)
    
    const ifcMeshes = this.state.models.map(model => model.mesh)
    const intersects = this.raycaster.intersectObjects(ifcMeshes)
    
    if (intersects.length > 0) {
      this.selectObject(intersects[0])
    } else {
      this.deselectObject()
    }
  }
  
  private async selectObject(intersection: any): Promise<void> {
    const mesh = intersection.object
    const index = intersection.faceIndex
    const modelID = this.getModelID(mesh)
    
    if (modelID === -1) return
    
    try {
      const manager = this.ifcLoader.ifcManager
      const expressID = manager.getExpressId(mesh.geometry, index)
      
      this.highlightObject(mesh, expressID, modelID)
      
      let properties: IFCProperty[] = []
      if (this.config.enableProperties) {
        properties = await this.getObjectProperties(modelID, expressID)
      }
      
      const selectedObject: SelectedObject = {
        object: mesh,
        expressID,
        modelID,
        properties
      }
      
      this.state.selectedObject = selectedObject
      this.emit('object-selected', selectedObject)
      
    } catch (error) {
      console.error('Error selecting object:', error)
    }
  }
  
  private deselectObject(): void {
    if (this.state.selectedObject) {
      this.removeHighlight()
      this.state.selectedObject = null
      this.emit('object-deselected')
    }
  }
  
  private highlightObject(mesh: Object3D, expressID: number, modelID: number): void {
    const manager = this.ifcLoader.ifcManager
    const highlightMaterial = new MeshLambertMaterial({
      transparent: true,
      opacity: 0.8,
      color: new Color(0x88c999)
    })
    
    manager.createSubset({
      modelID,
      ids: [expressID],
      material: highlightMaterial,
      scene: this.scene,
      removePrevious: true
    })
  }
  
  private removeHighlight(): void {
    if (this.state.selectedObject) {
      const manager = this.ifcLoader.ifcManager
      manager.removeSubset(this.state.selectedObject.modelID, undefined)
    }
  }
  
  private getModelID(mesh: Object3D): number {
    for (const model of this.state.models) {
      if (model.mesh === mesh) {
        return model.modelID
      }
    }
    return -1
  }
  
  private async getObjectProperties(modelID: number, expressID: number): Promise<IFCProperty[]> {
    try {
      const manager = this.ifcLoader.ifcManager
      const props = await manager.getItemProperties(modelID, expressID)
      
      const properties: IFCProperty[] = []
      
      if (props.Name?.value) {
        properties.push({
          name: 'Name',
          value: props.Name.value,
          type: 'string'
        })
      }
      
      if (props.GlobalId?.value) {
        properties.push({
          name: 'GlobalId',
          value: props.GlobalId.value,
          type: 'string'
        })
      }
      
      if (props.ObjectType?.value) {
        properties.push({
          name: 'ObjectType',
          value: props.ObjectType.value,
          type: 'string'
        })
      }
      
      return properties
    } catch (error) {
      console.error('Error getting properties:', error)
      return []
    }
  }
  
  private updateCameraState(): void {
    const position = this.camera.position
    const target = this.controls.target
    
    this.state.cameraState = {
      position: [position.x, position.y, position.z],
      target: [target.x, target.y, target.z],
      zoom: this.camera.zoom
    }
    
    this.emit('camera-changed', this.state.cameraState)
  }
  
  private animate(): void {
    requestAnimationFrame(() => this.animate())
    
    this.controls.update()
    this.lodManager.updateLOD(this.camera)
    this.renderer.render(this.scene, this.camera)
  }
  
  public async loadIFC(file: File): Promise<IFCModel> {
    try {
      const url = URL.createObjectURL(file)
      const ifcModel = await this.ifcLoader.loadAsync(url)
      
      ifcModel.removeFromParent = ifcModel.removeFromParent.bind(ifcModel)
      
      const model: IFCModel = {
        modelID: ifcModel.modelID,
        mesh: ifcModel,
        ifcManager: this.ifcLoader.ifcManager
      }
      
      this.state.models.push(model)
      this.scene.add(ifcModel)
      
      await this.hideSpaces(model.modelID)
      this.fitToModel(ifcModel)
      
      // Temporarily disable LOD to debug model display
      // this.lodManager.createLODForModel(model, this.camera)
      
      this.emit('model-loaded', model)
      URL.revokeObjectURL(url)
      
      return model
    } catch (error) {
      console.error('Error loading IFC:', error)
      throw error
    }
  }
  
  private async hideSpaces(modelID: number): Promise<void> {
    try {
      const manager = this.ifcLoader.ifcManager
      const spaces = await manager.getAllItemsOfType(modelID, IFCSPACE, false)
      const spaceIDs = spaces.map(space => space.expressID)
      
      if (spaceIDs.length > 0) {
        manager.createSubset({
          modelID,
          ids: spaceIDs,
          material: new MeshLambertMaterial({ visible: false }),
          scene: this.scene
        })
      }
    } catch (error) {
      console.warn('Could not hide spaces:', error)
    }
  }
  
  private fitToModel(model: Object3D): void {
    const box = new Box3().setFromObject(model)
    const center = box.getCenter(new Vector3())
    const size = box.getSize(new Vector3())
    
    const maxDim = Math.max(size.x, size.y, size.z)
    const distance = maxDim / (2 * Math.tan(Math.PI * this.camera.fov / 360))
    
    this.camera.position.copy(center)
    this.camera.position.y += distance * 0.5
    this.camera.position.z += distance * 0.8
    
    this.controls.target.copy(center)
    this.controls.update()
    
    this.updateCameraState()
  }
  
  public resetCamera(): void {
    if (this.state.models.length > 0) {
      const model = this.state.models[0]
      this.fitToModel(model.mesh)
    } else {
      this.camera.position.set(...this.state.cameraState.position)
      this.controls.target.set(...this.state.cameraState.target)
      this.controls.update()
    }
  }
  
  public toggleWireframe(): void {
    this.state.wireframeMode = !this.state.wireframeMode
    
    this.state.models.forEach(model => {
      model.mesh.traverse((child) => {
        if (child.material) {
          child.material.wireframe = this.state.wireframeMode
        }
      })
    })
  }
  
  public getState(): ViewerState {
    return { ...this.state }
  }
  
  public on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, [])
    }
    this.eventListeners.get(event)!.push(callback)
  }
  
  private emit(event: string, ...args: any[]): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.forEach(listener => listener(...args))
    }
  }
  
  public dispose(): void {
    this.state.models.forEach(model => {
      this.ifcLoader.ifcManager.dispose()
      model.mesh.removeFromParent()
    })
    
    this.lodManager.dispose()
    this.renderer.dispose()
    this.controls.dispose()
    window.removeEventListener('resize', this.handleResize.bind(this))
  }
}