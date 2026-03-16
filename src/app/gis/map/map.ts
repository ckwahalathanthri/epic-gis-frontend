import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { LayerService } from '../../services/layer';
import { ModalService } from '../../services/modal.service';
import { FormsModule } from '@angular/forms';
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
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import * as webMercatorUtils from '@arcgis/core/geometry/support/webMercatorUtils';

declare const window: any;
declare const console: any;
declare function prompt(message?: string): string | null;

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, HttpClientModule, FormsModule],
  templateUrl: './map.html',
  styleUrls: ['./map.css']
})
export class MapComponent implements OnInit, OnDestroy {
  private map!: Map;
  private view: any;
  private mapView?: MapView;
  private sceneView?: SceneView;
  private sceneLayer?: SceneLayer;
  private userLayers: any[] = [];
  private graphicsLayer?: GraphicsLayer;
  private sketchWidget?: Sketch;
  private sceneLayerUrl: string | null = null;
  private forestLayer: any;
  private seismicLayer: any;
  private buildingLayer: any;

  // ── Handler handles – stored so we can remove before re-registering ──────
  private popupActionHandle: any = null;
  private clickHandle: any = null;

  // ── Public state for template bindings ───────────────────────────────────
  is3DMode = false;
  showEditPanel = false;
  editProperties: { key: string; value: string }[] = [];
  editingFeatureId: number | null = null;
  editingLayerId: string | null = null;
  isSaving = false;
  saveSuccess = false;
  editingGraphic: Graphic | null = null;

  constructor(
    private http: HttpClient,
    private layerService: LayerService,
    private modalService: ModalService
  ) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    esriConfig.assetsPath = '/assets';

    this.map = new Map({ basemap: 'streets-navigation-vector' });

    // Default to 2D. createMapView() sets this.view and wires popup handler.
    this.createMapView();

    // Widgets for the initial view
    this.addDefaultWidgets();

    // React to new layers uploaded via LayerService
    this.layerService.layerAdded$.subscribe({
      next: (url: string) => {
        console.info('Layer uploaded, adding to map:', url);
        try {
          this.addFeatureLayerFromUrl(url);
        } catch {
          try {
            const k = new KMLLayer({ url });
            this.map.add(k);
            this.userLayers.push(k);
          } catch (err) {
            console.error('Failed to add uploaded layer', err);
          }
        }
      }
    });

    // Load layers persisted in the backend
    this.loadBackendLayers();
  }

  ngOnDestroy(): void {
    this.detachHandlers();
    this.view?.destroy();
  }

  // ── View creation ─────────────────────────────────────────────────────────

  private createMapView(): void {
    this.mapView = new MapView({
      container: 'mapViewDiv',
      map: this.map,
      center: [80.7, 7.8],
      zoom: 7
    });
    this.view = this.mapView;

    // Wire popup handler only after the view is fully ready
    this.mapView.when(() => {
      this.setupPopupHandler();
    });
  }

  toggle3D(): void {
    this.is3DMode = !this.is3DMode;
    this.setViewMode(this.is3DMode ? '3d' : '2d');
  }

  async setViewMode(mode: '2d' | '3d'): Promise<void> {
    const is3d = mode === '3d';
    if (is3d && this.view?.type === '3d') return;
    if (!is3d && this.view?.type === '2d') return;

    // 1. Remove handlers from the OLD view before we swap
    this.detachHandlers();

    // 2. Capture viewport
    let currentViewpoint: any = null;
    if (this.view?.viewpoint) {
      currentViewpoint = this.view.viewpoint.clone();
    }
    if (this.view) {
      this.view.container = null;
    }

    // 3. Strip GeoJSON layers from the map before the new view is constructed.
    //    SceneView compiles layer pipelines at construction time; adding a
    //    GeoJSONLayer afterwards gets a 3-D pipeline only if the map is clean.
    const layerSnapshots = this.snapshotAndRemoveGeoJsonLayers();

    // 4. Create / reattach the target view
    if (is3d) {
      if (!this.sceneView) {
        this.sceneView = new SceneView({
          container: 'mapViewDiv',
          map: this.map,
          viewingMode: 'global'
        });
        if (!this.sceneLayer && this.sceneLayerUrl) {
          this.addSceneLayer(this.sceneLayerUrl);
        }
      } else {
        this.sceneView.container = document.getElementById('mapViewDiv') as any;
      }
      this.view = this.sceneView;
    } else {
      if (!this.mapView) {
        this.createMapView();
      } else {
        this.mapView.container = document.getElementById('mapViewDiv') as any;
      }
      this.view = this.mapView;
    }

    // 5. Once the new view's pipeline is ready, re-inject layers then wire handlers
    this.view.when(() => {
      this.restoreGeoJsonLayers(layerSnapshots, is3d);
      this.setupPopupHandler();
      this.restoreViewpoint(currentViewpoint, is3d);
    });

    // 6. Rebuild widgets on the new view
    this.addDefaultWidgets();
  }

  // ── Widget helpers ────────────────────────────────────────────────────────

  private addDefaultWidgets(): void {
    try {
      this.view.ui.empty();
      this.view.ui.add(new Editor({ view: this.view }), 'top-right');
      this.view.ui.add(new LayerList({ view: this.view }), 'top-left');
    } catch (e) {
      console.warn('Failed to add default widgets', e);
    }
  }

  // ── Popup / click handler ─────────────────────────────────────────────────

  /**
   * Attaches a single click → hitTest → openPopup pipeline, and a single
   * trigger-action listener for the "Edit Feature" popup button.
   *
   * Safe to call multiple times – always removes the previous handles first.
   */
private setupPopupHandler(): void {
  if (!this.view) return;

  this.detachHandlers();

  // Let ArcGIS handle hit detection natively — don't intercept clicks at all.
  // autoOpenEnabled = true means ArcGIS will open the popup itself when a
  // feature is clicked. We just watch for when it does.
  this.view.popupEnabled = true;
  if (this.view.popup) {
    this.view.popup.autoOpenEnabled = true;
    this.view.popup.dockEnabled     = false;
    this.view.popup.collapseEnabled = false;
  }

  // Watch for when ArcGIS selects a feature via its own click pipeline.
  // This fires AFTER the popup is already open, so we can safely read
  // selectedFeature and inject our custom content + action button.
  this.view.when(() => {
    if (!this.view?.popup) return;

    try {
                  // Watch selectedFeature — fires when user clicks a feature
      this.clickHandle = reactiveUtils.watch(
        () => this.view.popup.selectedFeature,
        (feature: any) => {
          if (!feature) return;

          console.log('selectedFeature changed:', feature);
          console.log('attributes:', feature.attributes);

          // Resolve owning layer (can be null on graphic in 3D)
          let owningLayer: any = feature.layer;
          if (!owningLayer?._backendLayerId) {
            owningLayer = this.userLayers.find(
              (l: any) =>
                l.type === 'geojson' &&
                (l.title === feature.sourceLayer?.title ||
                 l.title === feature.layer?.title)
            ) ?? owningLayer;
          }

          // Stash for action handler
          (feature as any)._resolvedBackendLayerId =
            (owningLayer as any)?._backendLayerId ?? null;
          (this.view.popup as any)._pendingFeature = feature;

          const title = feature.attributes?.name ?? owningLayer?.title ?? 'Feature Details';
          
          // Must render as an actual DOM Node so ArcGIS accepts it
          const contentDiv = document.createElement("div");
          contentDiv.innerHTML = this.buildPopupContent(feature.attributes);

          // Apply overriding template to the specific feature being clicked
          feature.popupTemplate = {
              title: title,
              content: contentDiv,
              actions: [{ id: 'edit-feature', title: '✏️ Edit Feature', className: 'esri-icon-edit' }]
          };

          // Explicitly command the popup to process this feature
          this.view.popup.open({
              features: [feature]
          });
        }
      );

      // Listen for the Edit button click
      this.popupActionHandle = reactiveUtils.on(
        () => this.view.popup,
        'trigger-action',
        (evt: any) => {
          if (evt.action.id !== 'edit-feature') return;

          const feature =
            this.view.popup.selectedFeature ??
            (this.view.popup as any)._pendingFeature;

          if (!feature) {
            console.warn('trigger-action: no feature found');
            return;
          }

          const backendLayerId =
            (feature as any)._resolvedBackendLayerId ??
            (feature.layer as any)?._backendLayerId;

          if (backendLayerId) {
            this.openEditPanel(feature, backendLayerId);
          } else {
            console.warn('trigger-action: no _backendLayerId', feature);
          }
        }
      );
    } catch (e) {
      console.warn('Could not set up popup watchers', e);
    }
  });
}

private buildPopupContent(attributes: any): string {
    if (!attributes) return '<p>No attributes available.</p>';
 
    const rows = Object.entries(attributes)
      .filter(
        ([key]) =>
          !key.startsWith('_') &&
          key !== 'OBJECTID' &&
          key !== 'ObjectID' &&
          key !== 'F_db_id'
      )
      .map(
        ([key, value]) => `
        <tr>
          <td style="padding:4px 10px 4px 0;font-weight:600;white-space:nowrap;
                     color:#555;vertical-align:top">${key}</td>
          <td style="padding:4px 0;word-break:break-word">${value ?? ''}</td>
        </tr>`
      )
      .join('');
 
    return rows
      ? `<table style="border-collapse:collapse;width:100%;font-size:13px">
           ${rows}
         </table>`
      : '<p>No displayable attributes.</p>';
  }

  /** Remove all view-level event handles. Safe to call when handles are null. */
  private detachHandlers(): void {
    this.clickHandle?.remove();
    this.clickHandle = null;

    this.popupActionHandle?.remove();
    this.popupActionHandle = null;
  }

  // ── Edit panel ────────────────────────────────────────────────────────────

  openEditPanel(feature: any, backendLayerId: string): void {
    const attrs = feature.attributes;

    this.editingFeatureId = attrs._db_id ?? null;
    this.editingLayerId = backendLayerId;

    // Build the editable property list, stripping internal / ArcGIS fields
    this.editProperties = Object.entries(attrs)
      .filter(
        ([key]) =>
          key !== '_db_id' &&
          key !== 'OBJECTID' &&
          key !== 'ObjectID' &&
          !key.startsWith('_')
      )
      .map(([key, value]) => ({ key, value: String(value ?? '') }));

    this.showEditPanel = true;
    this.saveSuccess = false;

    this.startGeometryEdit(feature);

    try { this.view.popup.close(); } catch { /* ignore */ }
  }

  startGeometryEdit(feature: any): void {
    if (!this.view) return;

    // Ensure a dedicated GraphicsLayer exists for the editable clone
    if (!this.graphicsLayer) {
      this.graphicsLayer = new GraphicsLayer();
      this.map.add(this.graphicsLayer);
      this.userLayers.push(this.graphicsLayer);
    }

    // Create Sketch widget once per view; re-use across edits
    if (!this.sketchWidget) {
      this.sketchWidget = new Sketch({
        layer: this.graphicsLayer,
        view: this.view,
        creationMode: 'update'
      });
      this.view.ui.add(this.sketchWidget, 'top-right');
    }

    const isPoint = feature.geometry?.type === 'point';
    const symbol: any = isPoint
      ? {
          type: 'simple-marker',
          color: [0, 255, 255, 0.8],
          size: 10,
          outline: { color: [0, 200, 255, 1], width: 2 }
        }
      : {
          type: 'simple-fill',
          color: [0, 255, 255, 0.4],
          outline: { color: [0, 255, 255, 1], width: 2 }
        };

    this.editingGraphic = new Graphic({
      geometry: feature.geometry.clone(),
      symbol
    });

    this.graphicsLayer.removeAll();
    this.graphicsLayer.add(this.editingGraphic);

    // Activate reshape handles on the cloned graphic immediately
    this.sketchWidget.update([this.editingGraphic], { tool: 'reshape' });
  }

  saveFeature(): void {
    if (!this.editingFeatureId || !this.editingLayerId || this.isSaving) return;
    this.isSaving = true;

    const properties: Record<string, string> = {};
    this.editProperties.forEach(p => { properties[p.key] = p.value; });

    const geojsonGeometry =
      this.editingGraphic?.geometry
        ? this.convertToGeoJson(this.editingGraphic.geometry)
        : null;

    const currentLayerId = this.editingLayerId;

    this.layerService
      .updateFeature(currentLayerId, this.editingFeatureId, properties, geojsonGeometry)
      .subscribe({
        next: () => {
          this.saveSuccess = true;
          this.layerService.emitToast('Feature saved successfully!');
          this.cancelEdit();
          this.refreshSingleGeoJsonLayer(currentLayerId);
        },
        error: (err: any) => {
          console.error('Save failed', err);
          this.layerService.emitToast('Save failed. Please try again.');
          this.isSaving = false;
        }
      });
  }

  cancelEdit(): void {
    this.showEditPanel = false;
    this.editProperties = [];
    this.editingFeatureId = null;
    this.editingLayerId = null;
    this.isSaving = false;
    this.saveSuccess = false;

    this.sketchWidget?.cancel();
    this.graphicsLayer?.removeAll();
    this.editingGraphic = null;
  }

  // ── Layer helpers ─────────────────────────────────────────────────────────

  /**
   * Builds a popup template that shows all feature properties as a field list,
   * plus an "Edit Feature" action button.
   */
  private buildPopupTemplate(sampleProperties: Record<string, any>): any {
    const fieldInfos = Object.keys(sampleProperties)
      .filter(k => k !== '_db_id')
      .map(key => ({ fieldName: key, label: key }));

    return {
      title: '{name}', // Falls back gracefully if 'name' field is absent
      content: [{ type: 'fields', fieldInfos }],
      actions: [
        {
          id: 'edit-feature',
          title: '✏️ Edit Feature',
          className: 'esri-icon-edit'
        }
      ]
    };
  }

  private buildRenderers(geometryType: string): { renderer2D: any; renderer3D: any } {
    if (geometryType === 'Point' || geometryType === 'MultiPoint') {
      const r = {
        type: 'simple',
        symbol: {
          type: 'simple-marker',
          color: [255, 100, 0, 0.9],
          size: 8,
          outline: { color: [255, 255, 255], width: 1 }
        }
      };
      return { renderer2D: r, renderer3D: r };
    }

    return {
      renderer2D: {
        type: 'simple',
        symbol: {
          type: 'simple-fill',
          color: [255, 0, 255, 0.5],
          outline: { color: [255, 255, 255], width: 1 }
        }
      },
      renderer3D: {
        type: 'simple',
        symbol: {
          type: 'polygon-3d',
          symbolLayers: [
            {
              type: 'extrude',
              size: 15,
              material: { color: [0, 200, 255, 0.9] },
              edges: { type: 'solid', color: [0, 80, 120, 1.0], size: 0.5 }
            }
          ]
        }
      }
    };
  }

  /**
   * Creates a GeoJSONLayer from a FeatureCollection, attaches all custom
   * metadata used for 2D/3D switching and edit round-trips, then adds it
   * to the map.
   */
  private addGeoJsonLayerToMap(
    geoJson: any,
    title: string,
    backendLayerId: string
  ): GeoJSONLayer | null {
    if (!geoJson?.features?.length) {
      console.warn('GeoJSON has no features – skipping layer:', title);
      return null;
    }

    const firstGeomType = geoJson.features[0].geometry.type;
    const { renderer2D, renderer3D } = this.buildRenderers(firstGeomType);
    const popupTemplate = this.buildPopupTemplate(
      geoJson.features[0]?.properties ?? {}
    );

    const blob = new Blob([JSON.stringify(geoJson)], { type: 'application/json' });
    const blobUrl = URL.createObjectURL(blob);

    const layer = new GeoJSONLayer({
      url: blobUrl,
      title,
      renderer: this.is3DMode ? renderer3D : renderer2D,
      elevationInfo: { mode: 'on-the-ground' },
      popupTemplate,
      outFields: ['*']
    });

    // Tag the layer with everything needed for view-mode switching and editing
    (layer as any).customRenderer2D = renderer2D;
    (layer as any).customRenderer3D = renderer3D;
    (layer as any)._blobUrl = blobUrl;
    (layer as any)._geoJsonData = geoJson;
    (layer as any)._backendLayerId = backendLayerId;
    (layer as any)._popupTemplate = popupTemplate;

    this.map.add(layer);
    this.userLayers.push(layer);
    return layer;
  }

  refreshSingleGeoJsonLayer(backendLayerId: string): void {
    const targetLayer: any = this.userLayers.find(
      l => (l as any)._backendLayerId === backendLayerId
    );
    if (!targetLayer) return;

    this.layerService.getLayerGeoJson(backendLayerId).subscribe({
      next: (geoJson: any) => {
        const blob = new Blob([JSON.stringify(geoJson)], { type: 'application/json' });
        const newUrl = URL.createObjectURL(blob);

        if (targetLayer._blobUrl) {
          URL.revokeObjectURL(targetLayer._blobUrl);
        }

        targetLayer._geoJsonData = geoJson;
        targetLayer._blobUrl = newUrl;
        // Setting .url triggers ArcGIS to re-fetch and re-render the layer
        targetLayer.url = newUrl;
      },
      error: (err: any) => console.error('Failed to refresh GeoJSON layer', err)
    });
  }

  // ── 2D↔3D layer snapshot helpers ─────────────────────────────────────────

  private snapshotAndRemoveGeoJsonLayers(): Array<{
    title: string;
    geoJsonData: any;
    r2d: any;
    r3d: any;
    backendLayerId: string | null;
    popupTemplate: any;
  }> {
    const snapshots: any[] = [];

    for (const layer of this.userLayers) {
      const geoJsonData = (layer as any)._geoJsonData;
      const r2d = (layer as any).customRenderer2D;
      const r3d = (layer as any).customRenderer3D;

      if (geoJsonData && r2d && r3d) {
        try { this.map.remove(layer); } catch { /* ignore */ }
        if ((layer as any)._blobUrl) {
          try { URL.revokeObjectURL((layer as any)._blobUrl); } catch { /* ignore */ }
        }
        snapshots.push({
          title: layer.title,
          geoJsonData,
          r2d,
          r3d,
          backendLayerId: (layer as any)._backendLayerId ?? null,
          popupTemplate: (layer as any)._popupTemplate ?? null
        });
      }
    }

    // Keep only non-GeoJSON layers in the tracking array
    this.userLayers = this.userLayers.filter((l: any) => !l._geoJsonData);
    return snapshots;
  }

  private restoreGeoJsonLayers(snapshots: any[], is3d: boolean): void {
    for (const { title, geoJsonData, r2d, r3d, backendLayerId, popupTemplate } of snapshots) {
      try {
        const newBlob = new Blob([JSON.stringify(geoJsonData)], { type: 'application/json' });
        const newUrl = URL.createObjectURL(newBlob);

        const newLayer = new GeoJSONLayer({
          url: newUrl,
          title,
          renderer: is3d ? r3d : r2d,
          elevationInfo: { mode: 'on-the-ground' },
          popupTemplate: popupTemplate ?? undefined,
          outFields: ['*']
        });

        (newLayer as any).customRenderer2D = r2d;
        (newLayer as any).customRenderer3D = r3d;
        (newLayer as any)._geoJsonData = geoJsonData;
        (newLayer as any)._blobUrl = newUrl;
        (newLayer as any)._backendLayerId = backendLayerId;
        (newLayer as any)._popupTemplate = popupTemplate;

        this.map.add(newLayer);
        this.userLayers.push(newLayer);
        console.info(`Layer restored to ${is3d ? '3D' : '2D'} pipeline:`, title);
      } catch (e) {
        console.warn('Failed to restore layer', title, e);
      }
    }
  }

  private restoreViewpoint(viewpoint: any, is3d: boolean): void {
    if (!viewpoint) return;
    if (is3d) {
      this.view
        .goTo({
          target: viewpoint.targetGeometry ?? viewpoint.center,
          scale: viewpoint.scale,
          tilt: 60
        })
        .catch(() => {
          try { this.view.viewpoint = viewpoint; } catch { /* ignore */ }
        });
    } else {
      try { this.view.viewpoint = viewpoint; } catch { /* ignore */ }
    }
  }

  // ── Backend layer loading ─────────────────────────────────────────────────

  private loadBackendLayers(): void {
    this.layerService.listLayers().subscribe({
      next: (layers: any) => {
        if (!layers) return;
        const items: any[] = Array.isArray(layers)
          ? layers
          : (layers.items ?? layers);

        (items || []).forEach((l: any) => {
          if (l.url && typeof l.url === 'string') {
            try { this.addFeatureLayerFromUrl(l.url); } catch { /* ignore */ }
          } else if (l.id) {
            this.layerService.getGeoJson(l.id).subscribe({
              next: (g: any) => {
                try {
                  if (g?.type === 'FeatureCollection') {
                    this.addGeoJsonLayerToMap(g, l.name ?? `layer-${l.id}`, l.id);
                  } else if (g?.url) {
                    const geo = new GeoJSONLayer({ url: g.url, title: l.name ?? `layer-${l.id}` });
                    this.map.add(geo);
                    this.userLayers.push(geo);
                  }
                } catch (err) {
                  console.error('Failed to add GeoJSON layer from backend', err);
                }
              },
              error: (err: any) => console.warn('getGeoJson failed for', l.id, err)
            });
          }
        });
      },
      error: (err: any) => console.warn('listLayers failed', err)
    });
  }

  // ── File upload ───────────────────────────────────────────────────────────

  uploadFile(event: any): void {
    const file = (event.target as any).files?.[0];
    if (!file) return;

    this.layerService.uploadLayer(file, file.name).subscribe({
      next: (res: any) => {
        if (!res?.id) return;
        console.info('Upload successful, fetching GeoJSON for layer', res.id);

        this.layerService.getLayerGeoJson(res.id).subscribe({
          next: (geoJson: any) => {
            const layer = this.addGeoJsonLayerToMap(
              geoJson,
              res.layerName ?? `layer-${res.id}`,
              res.id
            );

            // Zoom to the new layer once it has loaded
            layer?.when(() => {
              if (layer.fullExtent) {
                this.view.goTo(layer.fullExtent).catch((e: any) => console.warn(e));
              }
            });
          },
          error: (err: any) => console.error('Failed to fetch layer GeoJSON', err)
        });
      },
      error: (err: any) => console.error('Upload failed', err)
    });
  }

  // ── Basemap ───────────────────────────────────────────────────────────────

  async addEnterpriseBasemap(): Promise<void> {
    const url = await this.modalService.prompt(
      'Enter ArcGIS Enterprise Tile/MapServer URL:'
    );
    if (!url) return;

    try {
      const basemap = new Basemap({ baseLayers: [new TileLayer({ url })] });
      this.map.basemap = basemap;
    } catch {
      try {
        const basemap = new Basemap({ baseLayers: [new MapImageLayer({ url })] });
        this.map.basemap = basemap;
      } catch (err) {
        console.error('Failed to add enterprise basemap', err);
        window.alert('Failed to add basemap. Check the URL and CORS/token settings.');
      }
    }
  }

  // ── SceneLayer ────────────────────────────────────────────────────────────

  private addSceneLayer(url: string): void {
    try {
      this.sceneLayer = new SceneLayer({ url });
      this.map.add(this.sceneLayer);
    } catch (err) {
      console.error('Failed to add SceneLayer', err);
      window.alert('Failed to add SceneLayer. Check the URL or permissions.');
    }
  }

  // ── Geometry conversion ───────────────────────────────────────────────────

  private convertToGeoJson(geometry: any): any {
    const geo: any = webMercatorUtils.webMercatorToGeographic(geometry);
    if (geo.type === 'point') {
      return { type: 'Point', coordinates: [geo.longitude, geo.latitude] };
    }
    if (geo.type === 'polyline') {
      return { type: 'LineString', coordinates: geo.paths[0] };
    }
    if (geo.type === 'polygon') {
      return { type: 'Polygon', coordinates: geo.rings };
    }
    return null;
  }

  // ── Overlay layer toggles ─────────────────────────────────────────────────

  async toggleForestDensity(enabled: boolean): Promise<void> {
    if (enabled) {
      if (!this.forestLayer) {
        const url = await this.modalService.prompt(
          'Enter Feature/Tile layer URL for Forest Density (blank = empty placeholder):'
        );
        this.forestLayer = url
          ? this.tryFeatureOrTile(url)
          : new GraphicsLayer({ title: 'Forest Density' });
        this.map.add(this.forestLayer);
        this.userLayers.push(this.forestLayer);
      } else {
        try { this.map.add(this.forestLayer); } catch { /* ignore */ }
      }
    } else {
      try { this.map.remove(this.forestLayer); } catch { /* ignore */ }
    }
  }

  async toggleSeismicActivity(enabled: boolean): Promise<void> {
    if (enabled) {
      if (!this.seismicLayer) {
        const url = await this.modalService.prompt(
          'Enter Feature/Tile layer URL for Seismic Activity (blank = empty placeholder):'
        );
        this.seismicLayer = url
          ? this.tryFeatureOrTile(url)
          : new GraphicsLayer({ title: 'Seismic Activity' });
        this.map.add(this.seismicLayer);
        this.userLayers.push(this.seismicLayer);
      } else {
        try { this.map.add(this.seismicLayer); } catch { /* ignore */ }
      }
    } else {
      try { this.map.remove(this.seismicLayer); } catch { /* ignore */ }
    }
  }

  async toggleBuildingFootprints(enabled: boolean): Promise<void> {
    if (enabled) {
      if (!this.buildingLayer) {
        const input = await this.modalService.prompt(
          'Enter Feature/Scene layer URL for Building Footprints (blank = OSM 3D Buildings):'
        );
        const url = input?.trim()
          || 'https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings_v1/SceneServer';

        this.buildingLayer = url.includes('SceneServer')
          ? new SceneLayer({ url })
          : new FeatureLayer({ url, outFields: ['*'] });

        this.map.add(this.buildingLayer);
        this.userLayers.push(this.buildingLayer);
      } else {
        try { this.map.add(this.buildingLayer); } catch { /* ignore */ }
      }
    } else {
      try { this.map.remove(this.buildingLayer); } catch { /* ignore */ }
    }
  }

  private tryFeatureOrTile(url: string): FeatureLayer | TileLayer {
    try {
      return new FeatureLayer({ url, outFields: ['*'] });
    } catch {
      return new TileLayer({ url });
    }
  }

  // ── Feature layer (ArcGIS FeatureServer) ─────────────────────────────────

  async addFeatureLayer(): Promise<void> {
    const url = await this.modalService.prompt('Enter Feature Layer URL:');
    if (url) this.addFeatureLayerFromUrl(url);
  }

  addFeatureLayerFromUrl(url: string): void {
    const layer = new FeatureLayer({ url, outFields: ['*'] });
    this.map.add(layer);
    this.userLayers.push(layer);

    // Pre-fetch features for attribute table support
    layer
      .queryFeatures({ where: '1=1', outFields: ['*'], returnGeometry: true })
      .then((results: any) => {
        const feats = (results?.features ?? []).map((f: any) => ({
          attributes: f.attributes,
          geometry: f.geometry,
          layerUrl: layer.url
        }));
        this.layerService.setCurrentFeatures(feats);
      })
      .catch((err: any) => console.warn('queryFeatures failed', err));

    // Popup actions for FeatureServer layers (edit name / delete)
    try {
      this.view.popup.actions.removeAll?.();
      this.view.popup.actions.add({ id: 'edit', title: 'Edit', className: 'esri-icon-edit' });
      this.view.popup.actions.add({ id: 'delete', title: 'Delete', className: 'esri-icon-trash' });

      this.view.popup.on('trigger-action', async (evt: any) => {
        const selected = this.view.popup.selectedFeature;
        if (!selected) return;

        const attrs = selected.attributes;
        const objectId = attrs.objectId ?? attrs.OBJECTID ?? attrs.FID ?? attrs.id;

        if (evt.action.id === 'edit') {
          const newName = await this.modalService.prompt('Enter new name', attrs?.name ?? '');
          if (newName == null) return;
          this.layerService
            .applyEditsProxy(layer.url!, { updates: [{ attributes: { objectId, name: newName } }] })
            .subscribe({
              next: () => this.layerService.emitToast('Feature edited'),
              error: (err: any) => { console.error(err); this.layerService.emitToast('Edit failed'); }
            });
        } else if (evt.action.id === 'delete') {
          if (!(await this.modalService.confirm('Delete this feature?'))) return;
          this.layerService
            .applyEditsProxy(layer.url!, { deletes: [objectId] })
            .subscribe({
              next: () => this.layerService.emitToast('Feature deleted'),
              error: (err: any) => { console.error(err); this.layerService.emitToast('Delete failed'); }
            });
        }
      });
    } catch (e) {
      console.warn('Popup action setup failed for FeatureLayer', e);
    }
  }

  // ── KML ───────────────────────────────────────────────────────────────────

  async addKMLLayer(): Promise<void> {
    const url = await this.modalService.prompt('Enter KML URL:');
    if (!url) return;
    const kmlLayer = new KMLLayer({ url });
    this.map.add(kmlLayer);
    this.userLayers.push(kmlLayer);
  }

  // ── Sketch / drawing tools ────────────────────────────────────────────────

  startSketch(): void {
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

    try { this.sketchWidget.create('polyline'); } catch (e) {
      console.warn('Sketch create failed', e);
    }
  }

  addPinAtCenter(): void {
    if (!this.view) return;

    if (!this.graphicsLayer) {
      this.graphicsLayer = new GraphicsLayer();
      this.map.add(this.graphicsLayer);
      this.userLayers.push(this.graphicsLayer);
    }

    const center = this.view.center;
    const pt: any = {
      type: 'point',
      longitude: center.x ?? center[0],
      latitude: center.y ?? center[1]
    };
    const symbol: any = {
      type: 'simple-marker',
      style: 'circle',
      color: [255, 77, 79, 0.95],
      size: '14px',
      outline: { color: [255, 255, 255, 0.9], width: 2 }
    };

    this.graphicsLayer.add(new Graphic({ geometry: pt, symbol }));
  }

  // ── Layer management ──────────────────────────────────────────────────────

  clearUserLayers(): void {
    for (const l of this.userLayers) {
      try { this.map.remove(l); } catch { /* ignore */ }
    }
    this.userLayers = [];
    this.graphicsLayer?.removeAll();
  }

  showAttributes(): void {
    const layer = this.map.layers.find(l => l.type === 'feature') as FeatureLayer | undefined;
    if (!layer) { console.warn('No FeatureLayer found'); return; }

    layer
      .queryFeatures({ where: '1=1', outFields: ['*'], num: 200 } as any)
      .then(results => console.table(results.features.map((f: any) => f.attributes)))
      .catch(err => console.error('QueryFeatures failed', err));
  }

  // ── SceneLayer URL accessors (used by template) ───────────────────────────

  getSceneLayerUrl(): string { return this.sceneLayerUrl ?? ''; }
  setSceneLayerUrl(url: string | null): void { this.sceneLayerUrl = url; }
}