import { TestBed } from '@angular/core/testing';
import * as LayerModule from './layer';

describe('Layer', () => {
  let service: any;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    const token = (LayerModule as any).Layer || (LayerModule as any).default || (LayerModule as any).LayerService;
    if (!token) {
      throw new Error("No export named 'Layer', 'default' or 'LayerService' found in './layer'");
    }
    service = TestBed.inject(token);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
