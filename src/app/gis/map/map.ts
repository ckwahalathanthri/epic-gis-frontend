import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { LayerService } from '../../services/layer';
import { ModalService } from '../../services/modal.service';
import esriConfig from '@arcgis/core/config';
import Map from '@arcgis/core/Map';
import MapView from '@arcgis/core/views/MapView';
import SceneView from '@arcgis/core/views/SceneView';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import GeoJSONLayer from '@arcgis/core/layers/GeoJSONLayer';
import KMLLayer from '@arcgis/core/layers/KMLLayer';
import TileLayer from '@arcgis/core/layers/TileLayer';
import MapImageLayer from '@arcgis/core/layers/MapImageLayer';
import SceneLayer from '@arcgis/core/layers/SceneLayer';
import Basemap from '@arcgis/core/Basemap';
import Editor from '@arcgis/core/widgets/Editor';
import LayerList from '@arcgis/core/widgets/LayerList';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import Sketch from '@arcgis/core/widgets/Sketch';

declare const window: any;
declare const console: any;
declare function prompt(message?: string): string | null;

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, HttpClientModule],
  template: `
    <div style="display:flex;flex-direction:column;height:100%;">
      <div style="padding:8px;display:flex;gap:8px;align-items:center;">
        <button (click)="addFeatureLayer()">Add Feature Layer</button>
        <button (click)="addKMLLayer()">Add KML Layer</button>
        <button (click)="addEnterpriseBasemap()">Add ArcGIS Enterprise Basemap</button>
        <button (click)="showAttributes()">Show Attributes</button>
        <input type="file" (change)="uploadFile($event)" />
      </div>
      <div id="mapViewDiv" style="flex:1;"></div>
    </div>
  `,
  styles: [`
    :host { display:block; height:100%; width:100%; }
    #mapViewDiv { height:100%; width:100%; }
    /* You can add global styles to this file, and also import other style files */
   
  `]
})
export class MapComponent implements OnInit, OnDestroy {
  private map!: Map;
  // view may be MapView or SceneView
  private view: any;
  private sceneView?: SceneView;
  private sceneLayer?: SceneLayer;
  private userLayers: any[] = [];
  private graphicsLayer?: GraphicsLayer;
  private sketchWidget?: Sketch;
  // Default public SceneLayer URL (example). Replace with your SceneServer URL to auto-load 3D buildings.
  // Example public SceneLayer (may be rate-limited or changed by provider):
  // https://tiles.arcgis.com/tiles/P3ePLMYs2RVChkJx/arcgis/rest/services/LosAngeles_3D_Buildings/SceneServer
  private sceneLayerUrl: string | null = 'https://tiles.arcgis.com/tiles/P3ePLMYs2RVChkJx/arcgis/rest/services/LosAngeles_3D_Buildings/SceneServer';
  private forestLayer: any;
  private seismicLayer: any;
  private buildingLayer: any;

  constructor(private http: HttpClient, private layerService: LayerService, private modalService: ModalService) {}

  ngOnInit(): void {
    esriConfig.assetsPath = '/assets';

    this.map = new Map({ basemap: 'streets-navigation-vector' });

    // default to 2D MapView
    this.createMapView();

    // add widgets for initial view
    const editor = new Editor({ view: this.view });
    this.view.ui.add(editor, 'top-right');

    const layerList = new LayerList({ view: this.view });
    this.view.ui.add(layerList, 'top-left');

    // subscribe to uploaded layers and auto-add them to the map
    try {
      this.layerService.layerAdded$.subscribe((url: string) => {
        console.info('Layer uploaded, adding to map:', url);
        // attempt to add as FeatureLayer, otherwise KML
        try {
          this.addFeatureLayerFromUrl(url);
        } catch (e) {
          try { const k = new KMLLayer({ url }); this.map.add(k); this.userLayers.push(k); }
          catch (err) { console.error('Failed to add uploaded layer', err); }
        }
        // add an Editor for editing the newly added layer
        try {
          const addedLayer: any = this.map.layers.getItemAt(this.map.layers.length - 1);
          if (addedLayer) {
            const editor2 = new Editor({ view: this.view, layerInfos: [{ layer: addedLayer as any }] });
            this.view.ui.add(editor2, 'top-right');
          }
        } catch (err) { /* ignore */ }
      });
    } catch (e) { console.warn('LayerService subscribe failed', e); }

    // load existing layers from backend
    try {
      this.layerService.listLayers().subscribe({
        next: (layers: any) => {
          if (!layers) return;
          // layers may be array or object with items
          const items = Array.isArray(layers) ? layers : (layers.items ?? layers);
          (items || []).forEach((l: any) => {
            // if descriptor has direct url (FeatureServer/KML), try adding as FeatureLayer
            if (l.url && typeof l.url === 'string') {
              try { this.addFeatureLayerFromUrl(l.url); }
              catch (e) { console.warn('addFeatureLayerFromUrl failed, trying KML/GeoJSON', e); }
            } else if (l.id) {
              // fetch geojson for this layer id
              this.layerService.getGeoJson(l.id).subscribe({
                next: (g: any) => {
                    try {
                    // If backend returned a URL, use it
                    if (g && typeof g === 'object' && g.type === 'FeatureCollection') {
                      const blob = new (window as any).Blob([JSON.stringify(g)], { type: 'application/json' });
                      const url = (window as any).URL.createObjectURL(blob);
                      const geo = new GeoJSONLayer({ url, title: l.name ?? ('layer-' + l.id) });
                      this.map.add(geo);
                      this.userLayers.push(geo);
                    } else if (g && g.url) {
                      const geo = new GeoJSONLayer({ url: g.url, title: l.name ?? ('layer-' + l.id) });
                      this.map.add(geo);
                      this.userLayers.push(geo);
                    }
                  } catch (err) { console.error('Failed to add geojson layer', err); }
                },
                error: (err: any) => { console.warn('getGeoJson failed for', l.id, err); }
              });
            }
          });
        },
        error: (err: any) => { console.warn('listLayers failed', err); }
      });
    } catch (e) {
      console.warn('Failed to load layers from backend', e);
    }
  }

  ngOnDestroy(): void {
    this.view?.destroy();
  }

  uploadFile(event: any) {
    const file = (event.target as any).files?.[0];
    if (!file) return;

    // Use the LayerService to upload, which handles the correct URL and parameters
    this.layerService.uploadLayer(file, file.name).subscribe({
        next: (res: any) => {
            console.log('Upload successful:', res);
            
            if (res && res.id) {
                 console.info('Layer ID ' + res.id + ' created. Fetching GeoJSON...');
                 
                 // Fetch the GeoJSON and display it immediately
                 this.layerService.getLayerGeoJson(res.id).subscribe({
                     next: (geoJson: any) => {
                         console.log('GeoJSON fetched:', geoJson);
                         
                         // Create a blob URL for the GeoJSONLayer
                         const blob = new Blob([JSON.stringify(geoJson)], { type: 'application/json' });
                         const url = URL.createObjectURL(blob);
                         
                         const layer = new GeoJSONLayer({
                             url: url,
                             title: res.layerName || ('layer-' + res.id),
                             // Optional: simple renderer if needed, or rely on default
                         });
                         
                         this.map.add(layer);
                         console.info('Layer added to map.');
                         
                         // Try to zoom to the layer extent once loaded
                         layer.when(() => {
                            if (layer.fullExtent) {
                                this.view.goTo(layer.fullExtent).catch((e: any) => console.warn(e));
                            }
                         });
                     },
                     error: (err: any) => console.error('Failed to fetch layer GeoJSON', err)
                 });
            }
        },
        error: (err: any) => console.error('Upload failed', err)
    });
  }


  async addEnterpriseBasemap() {
    const url = await this.modalService.prompt('Enter ArcGIS Enterprise Tile/MapServer URL (e.g. https://.../MapServer or /TileServer):');
    if (!url) return;

    // try creating a TileLayer first, fallback to MapImageLayer
    let layer: any;
    try {
      layer = new TileLayer({ url });
      const basemap = new Basemap({ baseLayers: [layer] });
      this.map.basemap = basemap;
      return;
    } catch (e) {
      try {
        layer = new MapImageLayer({ url });
        const basemap = new Basemap({ baseLayers: [layer] });
        this.map.basemap = basemap;
        return;
      } catch (err) {
        console.error('Failed to add enterprise basemap', err);
        window.alert('Failed to add basemap. Check the URL and CORS/token settings.');
      }
    }
  }

  /**
   * Switch between 2D (MapView) and 3D (SceneView).
   */
  async setViewMode(mode: '2d' | '3d') {
    // if already in requested mode do nothing
    const is3d = mode === '3d';
    if (is3d && this.sceneView) return;
    if (!is3d && this.view && this.view.type === '3d') {
      // switch to 2d
    }

    // destroy existing view
    try { this.view?.destroy(); } catch (e) { /* ignore */ }

    if (is3d) {
      // create SceneView
      this.sceneView = new SceneView({
        container: 'mapViewDiv',
        map: this.map,
        center: [80.7, 7.8],
        zoom: 16,
        viewingMode: 'local',
        camera: {
          position: {
            x: 80.7,
            y: 7.8,
            z: 1200
          },
          tilt: 60
        }
      });
      this.view = this.sceneView;
      // attempt to add a 3D building SceneLayer automatically if configured
      if (!this.sceneLayer) {
        if (this.sceneLayerUrl) {
          this.addSceneLayer(this.sceneLayerUrl);
        } else {
          // prompt the user whether they'd like to load a 3D building layer
          try {
            const load = await this.modalService.confirm('Enter 3D mode — automatically load a 3D building SceneLayer?');
            if (load) {
              const url = await this.modalService.prompt('SceneLayer URL (SceneServer endpoint):');
              if (url) {
                this.sceneLayerUrl = url;
                this.addSceneLayer(url);
              }
            }
          } catch (e) {
            console.info('User interaction for scene layer skipped or blocked.', e);
          }
        }
      }
    } else {
      this.createMapView();
    }

    // re-add widgets to the active view
    const editor = new Editor({ view: this.view });
    this.view.ui.add(editor, 'top-right');

    const layerList = new LayerList({ view: this.view });
    this.view.ui.add(layerList, 'top-left');
  }

  private createMapView() {
    this.view = new MapView({
      container: 'mapViewDiv',
      map: this.map,
      center: [80.7, 7.8],
      zoom: 7
    });
  }

  private addSceneLayer(url: string) {
    try {
      this.sceneLayer = new SceneLayer({ url });
      this.map.add(this.sceneLayer);
      console.info('SceneLayer added:', url);
    } catch (err) {
      console.error('Failed to add SceneLayer', err);
      window.alert('Failed to add SceneLayer. Check the URL or permissions.');
    }
  }

  async toggleForestDensity(enabled: boolean) {
    if (enabled) {
      if (!this.forestLayer) {
        const url = await this.modalService.prompt('Enter Feature/Tile layer URL for Forest Density (leave blank to add empty placeholder):');;
        if (url) {
          try {
            this.forestLayer = new FeatureLayer({ url, outFields: ['*'] });
          } catch (e) {
            this.forestLayer = new TileLayer({ url });
          }
        } else {
          this.forestLayer = new GraphicsLayer({ title: 'Forest Density' });
        }
        this.map.add(this.forestLayer);
        this.userLayers.push(this.forestLayer);
      } else {
        try { this.map.add(this.forestLayer); } catch (e) { /* ignore */ }
      }
    } else {
      if (this.forestLayer) { try { this.map.remove(this.forestLayer); } catch (e) { } }
    }
  }

  async toggleSeismicActivity(enabled: boolean) {
    if (enabled) {
      if (!this.seismicLayer) {
        const url = await this.modalService.prompt('Enter Feature/Tile layer URL for Seismic Activity (leave blank to add empty placeholder):');;
        if (url) {
          try { this.seismicLayer = new FeatureLayer({ url, outFields: ['*'] }); }
          catch (e) { this.seismicLayer = new TileLayer({ url }); }
        } else {
          this.seismicLayer = new GraphicsLayer({ title: 'Seismic Activity' });
        }
        this.map.add(this.seismicLayer);
        this.userLayers.push(this.seismicLayer);
      } else { try { this.map.add(this.seismicLayer); } catch (e) { } }
    } else {
      if (this.seismicLayer) { try { this.map.remove(this.seismicLayer); } catch (e) { } }
    }
  }

  async toggleBuildingFootprints(enabled: boolean) {
    if (enabled) {
      if (!this.buildingLayer) {
        const url = await this.modalService.prompt('Enter Feature/Scene layer URL for Building Footprints (SceneServer/FeatureServer) (leave blank to add placeholder):');;
        if (url) {
          // if in 3d prefer SceneLayer
          if (this.sceneView) {
            try { this.buildingLayer = new SceneLayer({ url }); }
            catch (e) { this.buildingLayer = new FeatureLayer({ url, outFields: ['*'] }); }
          } else {
            try { this.buildingLayer = new FeatureLayer({ url, outFields: ['*'] }); }
            catch (e) { this.buildingLayer = new TileLayer({ url }); }
          }
        } else {
          this.buildingLayer = new GraphicsLayer({ title: 'Building Footprints' });
        }
        this.map.add(this.buildingLayer);
        this.userLayers.push(this.buildingLayer);
      } else { try { this.map.add(this.buildingLayer); } catch (e) { } }
    } else {
      if (this.buildingLayer) { try { this.map.remove(this.buildingLayer); } catch (e) { } }
    }
  }

  async addFeatureLayer() {
    const url = await this.modalService.prompt('Enter Feature Layer URL:');
    if (url) this.addFeatureLayerFromUrl(url);
  }

  addFeatureLayerFromUrl(url: string) {
    const layer = new FeatureLayer({ url, outFields: ['*'] });
    this.map.add(layer);
    this.userLayers.push(layer);

    // query features and set current features for attributes table
    try {
      layer.queryFeatures({ where: '1=1', outFields: ['*'], returnGeometry: true })
        .then((results: any) => {
          const feats = (results?.features ?? []).map((f: any) => ({
            attributes: f.attributes,
            geometry: f.geometry,
            layerUrl: layer.url
          }));
          this.layerService.setCurrentFeatures(feats);
        })
        .catch((err: any) => console.warn('queryFeatures failed', err));
    } catch (e) { console.warn('queryFeatures error', e); }

    // add popup actions for edit/delete
    try {
      this.view.popup.actions.removeAll?.();
      this.view.popup.actions.add({ id: 'edit', title: 'Edit', className: 'esri-icon-edit' });
      this.view.popup.actions.add({ id: 'delete', title: 'Delete', className: 'esri-icon-trash' });

      this.view.popup.on('trigger-action', async (evt: any) => {
        const id = evt.action.id;
        const selected = this.view.popup.selectedFeature;
        if (!selected) return;
        const attrs = selected.attributes;
        const objectId = attrs.objectId ?? attrs.OBJECTID ?? attrs.FID ?? attrs.id;
        if (id === 'edit') {
          const newName = await this.modalService.prompt('Enter new name', attrs?.name ?? '');
          if (newName == null) return;
          const updates = [{ attributes: { objectId, name: newName } }];
          this.layerService.applyEditsProxy(layer.url!, { updates }).subscribe({ next: () => { this.layerService.emitToast('Edited feature'); }, error: (err: any) => { console.error(err); this.layerService.emitToast('Edit failed'); } });
        } else if (id === 'delete') {
          if (!(await this.modalService.confirm('Delete this feature?'))) return;
          this.layerService.applyEditsProxy(layer.url!, { deletes: [objectId] }).subscribe({ next: () => { this.layerService.emitToast('Deleted feature'); }, error: (err: any) => { console.error(err); this.layerService.emitToast('Delete failed'); } });
        }
      });
    } catch (e) { console.warn('popup action setup failed', e); }
  }

  async addKMLLayer() {
    const url = await this.modalService.prompt('Enter KML URL:');
    if (!url) return;
    const kmlLayer = new KMLLayer({ url });
    this.map.add(kmlLayer);
    this.userLayers.push(kmlLayer);
  }

  getSceneLayerUrl() { return this.sceneLayerUrl ?? ''; }
  setSceneLayerUrl(url: string | null) { this.sceneLayerUrl = url; }

  /** Start a sketch tool for drawing (polyline) */
  startSketch() {
    if (!this.view) return;
    if (!this.graphicsLayer) {
      this.graphicsLayer = new GraphicsLayer();
      this.map.add(this.graphicsLayer);
      this.userLayers.push(this.graphicsLayer);
    }

    if (!this.sketchWidget) {
      this.sketchWidget = new Sketch({ layer: this.graphicsLayer, view: this.view });
      this.view.ui.add(this.sketchWidget, 'top-right');
    }

    // create a polyline sketch
    try { this.sketchWidget.create('polyline'); }
    catch (e) { console.warn('Sketch create failed', e); }
  }

  addPinAtCenter() {
    if (!this.view) return;
    const center = this.view.center;
    if (!this.graphicsLayer) {
      this.graphicsLayer = new GraphicsLayer();
      this.map.add(this.graphicsLayer);
      this.userLayers.push(this.graphicsLayer);
    }

    const pt = { type: 'point', longitude: center.x ?? center[0], latitude: center.y ?? center[1] } as any;
    const symbol = {
      type: 'simple-marker',
      style: 'circle',
      color: [255, 77, 79, 0.95],
      size: '14px',
      outline: { color: [255,255,255,0.9], width: 2 }
    } as any;

    const g = new Graphic({ geometry: pt, symbol });
    this.graphicsLayer.add(g);
  }

  clearUserLayers() {
    // remove layers that were added by the user
    for (const l of this.userLayers) {
      try { this.map.remove(l); } catch (e) { /* ignore */ }
    }
    this.userLayers = [];
    // also clear graphics
    if (this.graphicsLayer) {
      this.graphicsLayer.removeAll();
    }
  }

  showAttributes() {
    const layer = this.map.layers.find(l => l.type === 'feature') as FeatureLayer | undefined;
    if (!layer) { console.warn('No FeatureLayer found'); return; }

    const query = layer.createQuery();
    query.where = '1=1';
    query.outFields = ['*'];
    query.num = 200;

    layer.queryFeatures(query)
      .then(results => console.table(results.features.map((f: any) => f.attributes)))
      .catch(err => console.error('QueryFeatures failed', err));
  }
}
