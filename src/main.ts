import { IFCViewer } from './core/IFCViewer'
import type { SelectedObject, IFCModel } from './types'

class App {
  private viewer: IFCViewer
  private elements: {
    fileInput: HTMLInputElement
    resetCamera: HTMLButtonElement
    toggleWireframe: HTMLButtonElement
    toggleLOD: HTMLButtonElement
    propertyPanel: HTMLElement
    propertyContent: HTMLElement
  }

  constructor() {
    this.elements = this.getUIElements()
    this.viewer = new IFCViewer({
      container: document.getElementById('viewer-container')!,
      enableSelection: true,
      enableProperties: true
    })
    
    this.setupEventListeners()
    this.loadDefaultIFC()
  }

  private getUIElements() {
    return {
      fileInput: document.getElementById('ifc-file-input') as HTMLInputElement,
      resetCamera: document.getElementById('reset-camera') as HTMLButtonElement,
      toggleWireframe: document.getElementById('toggle-wireframe') as HTMLButtonElement,
      toggleLOD: document.getElementById('toggle-lod') as HTMLButtonElement,
      propertyPanel: document.getElementById('property-panel') as HTMLElement,
      propertyContent: document.getElementById('property-content') as HTMLElement
    }
  }

  private setupEventListeners(): void {
    // PoC期間中はファイルアップロード機能を無効化
    // this.elements.fileInput.addEventListener('change', this.handleFileSelect.bind(this))
    
    this.elements.resetCamera.addEventListener('click', () => this.viewer.resetCamera())
    this.elements.toggleWireframe.addEventListener('click', () => this.viewer.toggleWireframe())
    this.elements.toggleLOD.addEventListener('click', this.handleToggleLOD.bind(this))
    
    this.viewer.on('model-loaded', this.handleModelLoaded.bind(this))
    this.viewer.on('object-selected', this.handleObjectSelected.bind(this))
    this.viewer.on('object-deselected', this.handleObjectDeselected.bind(this))
    
    // PoC期間中のUI設定
    this.setupPoCMode()
  }

  private async handleFileSelect(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    
    if (!file) return
    
    try {
      this.showLoading(true)
      await this.viewer.loadIFC(file)
      this.showMessage('IFCファイルを正常に読み込みました', 'success')
    } catch (error) {
      console.error('Failed to load IFC file:', error)
      this.showMessage('IFCファイルの読み込みに失敗しました', 'error')
    } finally {
      this.showLoading(false)
    }
  }

  private handleModelLoaded(model: IFCModel): void {
    console.log('Model loaded:', model)
    this.showMessage(`モデル ${model.modelID} を読み込みました`, 'success')
  }

  private handleObjectSelected(selection: SelectedObject): void {
    this.showProperties(selection)
  }

  private handleObjectDeselected(): void {
    this.hideProperties()
  }

  private showProperties(selection: SelectedObject): void {
    const { propertyPanel, propertyContent } = this.elements
    
    propertyContent.innerHTML = ''
    
    if (selection.properties && selection.properties.length > 0) {
      selection.properties.forEach(prop => {
        const propertyItem = document.createElement('div')
        propertyItem.className = 'property-item'
        
        const label = document.createElement('div')
        label.className = 'property-label'
        label.textContent = prop.name
        
        const value = document.createElement('div')
        value.className = 'property-value'
        value.textContent = String(prop.value)
        
        propertyItem.appendChild(label)
        propertyItem.appendChild(value)
        propertyContent.appendChild(propertyItem)
      })
    } else {
      const noProps = document.createElement('div')
      noProps.textContent = 'プロパティが見つかりません'
      noProps.style.color = '#999'
      propertyContent.appendChild(noProps)
    }
    
    propertyPanel.style.display = 'block'
  }

  private hideProperties(): void {
    this.elements.propertyPanel.style.display = 'none'
  }

  private showLoading(show: boolean): void {
    const button = this.elements.fileInput.nextElementSibling as HTMLElement
    if (show) {
      button.textContent = '読み込み中...'
      button.style.pointerEvents = 'none'
    } else {
      button.textContent = 'IFCファイルを読み込み'
      button.style.pointerEvents = 'auto'
    }
  }

  private handleToggleLOD(): void {
    // LOD設定のトグル実装は今後の拡張ポイント
    this.showMessage('LOD制御機能は実装中です', 'success')
  }

  private setupPoCMode(): void {
    const fileInputLabel = document.querySelector('label[for="ifc-file-input"]') as HTMLElement
    if (fileInputLabel) {
      fileInputLabel.textContent = 'PoC用サンプルデータ使用中'
      fileInputLabel.style.background = '#666'
      fileInputLabel.style.cursor = 'default'
      fileInputLabel.style.pointerEvents = 'none'
      fileInputLabel.title = 'PoC期間中はサンプルファイルを自動読み込みします'
    }
    
    this.elements.fileInput.disabled = true
    
    console.log('PoC mode activated: File upload disabled, using sample data only')
  }

  private async loadDefaultIFC(): Promise<void> {
    const maxRetries = 3
    let retryCount = 0
    
    while (retryCount < maxRetries) {
      try {
        this.showLoading(true)
        console.log(`Loading default IFC file (attempt ${retryCount + 1}/${maxRetries}) from: /sample_data/sample_BIM.ifc`)
        
        const response = await fetch('/sample_data/sample_BIM.ifc')
        console.log('Fetch response:', response.status, response.statusText)
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`)
        }
        
        const blob = await response.blob()
        console.log('Blob size:', blob.size, 'bytes')
        
        if (blob.size === 0) {
          throw new Error('Empty file received')
        }
        
        const file = new File([blob], 'sample_BIM.ifc', { type: 'application/ifc' })
        console.log('Created file object:', file.name, file.size)
        
        console.log('Starting IFC loading...')
        await this.viewer.loadIFC(file)
        console.log('IFC loading completed successfully')
        
        this.showMessage('PoC用サンプルIFCファイルを読み込みました', 'success')
        return
        
      } catch (error) {
        retryCount++
        console.error(`Failed to load default IFC file (attempt ${retryCount}):`, error)
        
        if (retryCount >= maxRetries) {
          this.showMessage(`PoC用サンプルファイルの読み込みに失敗しました (${maxRetries}回試行): ${error.message}`, 'error')
          this.showPoCErrorMessage()
          break
        } else {
          console.log(`Retrying in 2 seconds... (${retryCount}/${maxRetries})`)
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
      } finally {
        if (retryCount >= maxRetries || retryCount === 0) {
          this.showLoading(false)
        }
      }
    }
  }

  private showPoCErrorMessage(): void {
    const errorMessage = document.createElement('div')
    errorMessage.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 24px;
      border-radius: 8px;
      border: 2px solid #ef4444;
      text-align: center;
      z-index: 1001;
      max-width: 400px;
    `
    
    errorMessage.innerHTML = `
      <h3 style="color: #ef4444; margin-bottom: 12px;">PoC用データ読み込みエラー</h3>
      <p style="margin-bottom: 12px;">サンプルファイル（sample_BIM.ifc）の読み込みに失敗しました。</p>
      <p style="font-size: 12px; color: #ccc;">開発環境を確認してください。</p>
      <button onclick="this.parentElement.remove()" style="margin-top: 12px; padding: 8px 16px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">閉じる</button>
    `
    
    document.body.appendChild(errorMessage)
  }

  private showMessage(message: string, type: 'success' | 'error'): void {
    const messageEl = document.createElement('div')
    messageEl.textContent = message
    messageEl.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 24px;
      border-radius: 6px;
      color: white;
      font-weight: bold;
      z-index: 1000;
      ${type === 'success' ? 'background: #22c55e;' : 'background: #ef4444;'}
    `
    
    document.body.appendChild(messageEl)
    
    setTimeout(() => {
      messageEl.remove()
    }, 3000)
  }
}

new App()