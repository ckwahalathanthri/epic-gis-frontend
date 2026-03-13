import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  template: '<h1>Hello, gis-frontend</h1>',
})
class AppComponent {}

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AppComponent],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as any;
    expect(compiled.querySelector('h1')?.textContent).toContain('Hello, gis-frontend');
  });
});
