import { Component, ViewChild } from '@angular/core';
import { LayerService } from '../../services/layer';
import { CesiumMapComponent } from '../../gis/cesium-map/cesium-map'; // Import your map component
// Ensure you have CommonModule or similar if needed for templates

@Component({
  selector: 'app-dashboard',
  standalone: true, // Make sure it's standalone
  imports: [CesiumMapComponent], // Add the map component here to use in HTML
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  
  // Access the child map component to call its methods
  @ViewChild(CesiumMapComponent) mapComponent!: CesiumMapComponent;

  constructor(private layerService: LayerService) {}

  onUpload(file: File) {
    // You might want to get the name from an input later
    const layerName = file.name.split('.')[0]; 
    
    this.layerService.uploadLayer(file, layerName).subscribe({
      next: (layer) => {
        console.log('Upload success:', layer);
        // Step 2: Once uploaded, load it onto the map
        if (layer.id) {
            this.loadMapLayer(layer.id);
        }
      },
      error: (err) => console.error('Upload failed', err)
    });
  }

  // Define the missing method
  loadMapLayer(layerId: string) {
    console.log("Loading layer:", layerId);
    
    this.layerService.getLayerGeoJson(layerId).subscribe({
      next: (geoJson) => {
        console.log("GeoJSON received:", geoJson);
        // Pass data to the map component
        if (this.mapComponent) {
          this.mapComponent.addGeoJsonLayer(geoJson);
        } else {
             console.error("Map component not initialized yet!");
        }
      },
      error: (err) => console.error("Failed to load GeoJSON", err)
    });
  }
}