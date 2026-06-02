/* tslint:disable:no-unused-variable */

import { ComponentFixture, TestBed, fakeAsync, tick, waitForAsync } from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {DebugElement, NO_ERRORS_SCHEMA} from '@angular/core';

import {OwnerListComponent} from './owner-list.component';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute} from '@angular/router';
import { OwnerService } from '../owner.service';
import {Owner} from '../owner';
import {Observable, of} from 'rxjs';
import {RouterTestingModule} from '@angular/router/testing';
import {CommonModule} from '@angular/common';
import {PartsModule} from '../../parts/parts.module';
import {ActivatedRouteStub} from '../../testing/router-stubs';
import {OwnerDetailComponent} from '../owner-detail/owner-detail.component';
import {OwnersModule} from '../owners.module';
import {DummyComponent} from '../../testing/dummy.component';
import {OwnerAddComponent} from '../owner-add/owner-add.component';
import {OwnerEditComponent} from '../owner-edit/owner-edit.component';
import Spy = jasmine.Spy;


class OwnerServiceStub {
  searchOwners(q: string): Observable<Owner[]> {
    return of();
  }
}

describe('OwnerListComponent', () => {

  let component: OwnerListComponent;
  let fixture: ComponentFixture<OwnerListComponent>;
  let ownerService = new OwnerServiceStub();
  let searchOwnersSpy: Spy;
  let de: DebugElement;
  let el: HTMLElement;


  const testOwner: Owner = {
    id: 1,
    firstName: 'George',
    lastName: 'Franklin',
    address: '110 W. Liberty St.',
    city: 'Madison',
    telephone: '6085551023',
    pets: []
  };
  let testOwners: Owner[];

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [DummyComponent],
      schemas: [NO_ERRORS_SCHEMA],
      imports: [CommonModule, FormsModule, PartsModule, OwnersModule,
        RouterTestingModule.withRoutes(
          [{path: 'owners', component: OwnerListComponent},
            {path: 'owners/add', component: OwnerAddComponent},
            {path: 'owners/:id', component: OwnerDetailComponent},
            {path: 'owners/:id/edit', component: OwnerEditComponent}
          ])],
      providers: [
        {provide: OwnerService, useValue: ownerService},
        {provide: ActivatedRoute, useClass: ActivatedRouteStub}
      ]
    })
      .compileComponents();
  }));

  beforeEach(() => {
    testOwners = [testOwner];

    fixture = TestBed.createComponent(OwnerListComponent);
    component = fixture.componentInstance;
    ownerService = fixture.debugElement.injector.get(OwnerService);
    searchOwnersSpy = spyOn(ownerService, 'searchOwners')
      .and.returnValue(of(testOwners));
  });

  it('should create OwnerListComponent', () => {
    expect(component).toBeTruthy();
  });

  it('loads all owners on init with an empty query (after the debounce)', fakeAsync(() => {
    fixture.detectChanges();
    tick(300);

    expect(searchOwnersSpy).toHaveBeenCalledWith('');
    expect(component.owners).toEqual(testOwners);
    expect(component.isOwnersDataReceived).toBe(true);
  }));

  it('shows the owner full name after the initial load', fakeAsync(() => {
    fixture.detectChanges();
    tick(300);
    fixture.detectChanges();

    de = fixture.debugElement.query(By.css('.ownerFullName'));
    el = de.nativeElement;
    expect(el.innerText).toBe('George Franklin');
  }));

  it('debounces keystrokes into a single search with the final term', fakeAsync(() => {
    fixture.detectChanges();
    tick(300);
    searchOwnersSpy.calls.reset();

    component.searchControl.setValue('F');
    tick(100);
    component.searchControl.setValue('Fr');
    tick(100);
    component.searchControl.setValue('Fra');
    tick(300);

    expect(searchOwnersSpy).toHaveBeenCalledTimes(1);
    expect(searchOwnersSpy).toHaveBeenCalledWith('Fra');
  }));

  it('does not repeat the search when the term is unchanged', fakeAsync(() => {
    fixture.detectChanges();
    tick(300);
    searchOwnersSpy.calls.reset();

    component.searchControl.setValue('Fra');
    tick(300);
    component.searchControl.setValue('Fra');
    tick(300);

    expect(searchOwnersSpy).toHaveBeenCalledTimes(1);
  }));

});
