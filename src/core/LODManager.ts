import { Object3D, LOD, Mesh, BufferGeometry, MeshLambertMaterial, Vector3 } from 'three'
import type { IFCModel } from '../types'

export interface LODConfig {
  levels: LODLevel[]
  autoSwitch: boolean
  distanceThreshold: number
}

export interface LODLevel {
  distance: number
  simplificationRatio: number
  visible: boolean
}

export class LODManager {
  private lodObjects: Map<number, LOD> = new Map()
  private config: LODConfig = {
    levels: [
      { distance: 0, simplificationRatio: 1.0, visible: true },
      { distance: 50, simplificationRatio: 0.5, visible: true },
      { distance: 200, simplificationRatio: 0.2, visible: true },
      { distance: 500, simplificationRatio: 0.05, visible: false }
    ],
    autoSwitch: true,
    distanceThreshold: 1000
  }

  constructor(config?: Partial<LODConfig>) {
    if (config) {
      this.config = { ...this.config, ...config }
    }
  }

  public createLODForModel(model: IFCModel, camera: THREE.Camera): void {
    if (this.lodObjects.has(model.modelID)) {
      this.removeLODForModel(model.modelID)
    }

    const lodObject = new LOD()
    const originalMesh = model.mesh
    
    this.config.levels.forEach((level, index) => {
      const levelMesh = this.createLODLevel(originalMesh, level, index)
      if (levelMesh) {
        lodObject.addLevel(levelMesh, level.distance)
      }
    })

    originalMesh.parent?.add(lodObject)
    originalMesh.removeFromParent()
    
    this.lodObjects.set(model.modelID, lodObject)
  }

  private createLODLevel(originalMesh: Mesh, level: LODLevel, levelIndex: number): Mesh | null {
    if (!level.visible) return null

    try {
      const levelMesh = originalMesh.clone()
      
      if (level.simplificationRatio < 1.0 && levelIndex > 0) {
        this.simplifyGeometry(levelMesh, level.simplificationRatio)
      }
      
      this.adjustMaterial(levelMesh, levelIndex)
      
      return levelMesh
    } catch (error) {
      console.warn(`Failed to create LOD level ${levelIndex}:`, error)
      return levelIndex === 0 ? originalMesh : null
    }
  }

  private simplifyGeometry(mesh: Mesh, ratio: number): void {
    mesh.traverse((child) => {
      if (child instanceof Mesh && child.geometry) {
        const geometry = child.geometry
        
        if (geometry.attributes.position) {
          const positions = geometry.attributes.position.array
          const originalCount = positions.length / 3
          const targetCount = Math.max(3, Math.floor(originalCount * ratio))
          
          if (targetCount < originalCount) {
            const simplified = this.decimateVertices(positions, targetCount)
            geometry.setAttribute('position', simplified)
            geometry.computeVertexNormals()
          }
        }
      }
    })
  }

  private decimateVertices(positions: ArrayLike<number>, targetCount: number): THREE.BufferAttribute {
    const originalCount = positions.length / 3
    const step = Math.max(1, Math.floor(originalCount / targetCount))
    
    const newPositions: number[] = []
    
    for (let i = 0; i < originalCount; i += step) {
      const index = i * 3
      if (index + 2 < positions.length) {
        newPositions.push(
          positions[index],
          positions[index + 1],
          positions[index + 2]
        )
      }
    }
    
    return new THREE.BufferAttribute(new Float32Array(newPositions), 3)
  }

  private adjustMaterial(mesh: Mesh, levelIndex: number): void {
    const alpha = Math.max(0.3, 1.0 - (levelIndex * 0.2))
    
    mesh.traverse((child) => {
      if (child instanceof Mesh && child.material) {
        const material = child.material.clone()
        
        if (material instanceof MeshLambertMaterial) {
          material.transparent = levelIndex > 0
          material.opacity = alpha
          
          if (levelIndex > 2) {
            material.wireframe = true
          }
        }
        
        child.material = material
      }
    })
  }

  public updateLOD(camera: THREE.Camera): void {
    if (!this.config.autoSwitch) return

    this.lodObjects.forEach((lodObject) => {
      lodObject.update(camera)
    })
  }

  public setLODLevel(modelID: number, level: number): void {
    const lodObject = this.lodObjects.get(modelID)
    if (!lodObject) return

    if (level >= 0 && level < this.config.levels.length) {
      const distance = this.config.levels[level].distance
      lodObject.children.forEach((child, index) => {
        child.visible = index === level
      })
    }
  }

  public getCurrentLODLevel(modelID: number, camera: THREE.Camera): number {
    const lodObject = this.lodObjects.get(modelID)
    if (!lodObject) return 0

    const distance = camera.position.distanceTo(lodObject.position)
    
    for (let i = this.config.levels.length - 1; i >= 0; i--) {
      if (distance >= this.config.levels[i].distance) {
        return i
      }
    }
    
    return 0
  }

  public getMemoryUsage(): { total: number; byLevel: number[] } {
    let total = 0
    const byLevel: number[] = new Array(this.config.levels.length).fill(0)

    this.lodObjects.forEach((lodObject) => {
      lodObject.children.forEach((child, index) => {
        if (child instanceof Mesh && child.geometry) {
          const geometry = child.geometry
          const positions = geometry.attributes.position
          const memory = positions ? positions.array.byteLength : 0
          
          total += memory
          byLevel[index] += memory
        }
      })
    })

    return { total, byLevel }
  }

  public setConfig(config: Partial<LODConfig>): void {
    this.config = { ...this.config, ...config }
  }

  public getConfig(): LODConfig {
    return { ...this.config }
  }

  public removeLODForModel(modelID: number): void {
    const lodObject = this.lodObjects.get(modelID)
    if (lodObject) {
      lodObject.removeFromParent()
      this.lodObjects.delete(modelID)
    }
  }

  public dispose(): void {
    this.lodObjects.forEach((lodObject) => {
      lodObject.children.forEach((child) => {
        if (child instanceof Mesh) {
          child.geometry?.dispose()
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => mat.dispose())
          } else {
            child.material?.dispose()
          }
        }
      })
      lodObject.removeFromParent()
    })
    
    this.lodObjects.clear()
  }
}