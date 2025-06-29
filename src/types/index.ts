import { Object3D, Mesh, Camera, Scene, WebGLRenderer } from 'three'

export interface IFCModel {
  modelID: number
  mesh: Mesh
  ifcManager: any
}

export interface ViewerConfig {
  container: HTMLElement
  showStats?: boolean
  enableSelection?: boolean
  enableProperties?: boolean
}

export interface CameraState {
  position: [number, number, number]
  target: [number, number, number]
  zoom: number
}

export interface PropertyData {
  [key: string]: any
}

export interface IFCProperty {
  name: string
  value: string | number | boolean
  type: string
}

export interface SelectedObject {
  object: Object3D
  expressID: number
  modelID: number
  properties?: IFCProperty[]
}

export interface ViewerState {
  models: IFCModel[]
  selectedObject: SelectedObject | null
  cameraState: CameraState
  wireframeMode: boolean
  lodLevel: number
}

export interface ViewerEvents {
  'model-loaded': (model: IFCModel) => void
  'object-selected': (selection: SelectedObject) => void
  'object-deselected': () => void
  'camera-changed': (state: CameraState) => void
}