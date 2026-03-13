import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Statusbar } from './statusbar';

describe('Statusbar', () => {
  let component: Statusbar;
  let fixture: ComponentFixture<Statusbar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Statusbar]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Statusbar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
