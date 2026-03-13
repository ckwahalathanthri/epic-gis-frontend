import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common'; // Important for *ngIf, *ngFor
import { LayerService } from '../../services/layer';
import { CesiumMapComponent } from '../../gis/cesium-map/cesium-map'; 

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, CesiumMapComponent], // Add CommonModule for *ngIf
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  
  // Access the child map component to call its methods
  @ViewChild(CesiumMapComponent) mapComponent!: CesiumMapComponent;

  // Track active layers for the UI list
  layers: any[] = [];

  constructor(private layerService: LayerService) {}

  onUpload(file: File) {
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase();
    const allowedExtensions = new Set(['zip', 'json', 'geojson']);

    if (!extension || !allowedExtensions.has(extension)) {
      alert('Unsupported file format. Please upload .zip, .json, or .geojson files.');
      return;
    }

    const layerName = file.name.split('.')[0]; 
    console.log("Uploading file...", file.name);

    this.layerService.uploadLayer(file, layerName).subscribe({
      next: (layer) => {
        console.log('Upload success:', layer);
        
        // Add to our UI list
        this.layers.push({
            id: layer.id,
            name: layerName,
            visible: true
        });

        // Load onto map
        if (layer.id) {
            this.loadMapLayer(layer.id);
        }
      },
      error: (err) => console.error('Upload failed', err)
    });
  }

  loadMapLayer(layerId: string) {
    console.log("Loading layer:", layerId);
    this.layerService.getLayerGeoJson(layerId).subscribe({
      next: (geoJson) => {
        console.log("GeoJSON received:", geoJson);
        if (this.mapComponent) {
          this.mapComponent.addGeoJsonLayer(geoJson);
        }
      },
      error: (err) => console.error("Failed to load GeoJSON", err)
    });
  }

  // UI Actions
  
  toggleLayer(layer: any) {
      layer.visible = !layer.visible;
      // You would implement mapComponent.toggleLayer(id) here
      console.log("Toggle visibility for", layer.name);
  }

  removeLayer(layer: any) {
      this.layers = this.layers.filter(l => l !== layer);
      // You would implement mapComponent.removeLayer(id) here
      console.log("Removing layer", layer.name);
  }
    
  flyTo(layer: any) {
      console.log("Flying to layer", layer.name);
      // You would implement mapComponent.flyToLayer(id) here
  }
}