import {Component, OnInit} from '@angular/core';
import {FormControl} from '@angular/forms';
import {OwnerService} from '../owner.service';
import {Owner} from '../owner';
import {Router} from '@angular/router';
import {debounceTime, distinctUntilChanged, startWith, switchMap} from 'rxjs/operators';

@Component({
  selector: 'app-owner-list',
  templateUrl: './owner-list.component.html',
  styleUrls: ['./owner-list.component.css']
})
export class OwnerListComponent implements OnInit {
  searchControl = new FormControl('');
  owners: Owner[];
  isOwnersDataReceived: boolean = false;

  constructor(private router: Router, private ownerService: OwnerService) {

  }

  ngOnInit() {
    // One code path for the initial load and the live search: startWith('')
    // issues the first (unfiltered) query. The 300ms debounce also delays that
    // first load — accepted trade-off (see the spec), do not special-case it.
    // switchMap cancels stale in-flight requests so a slow earlier response
    // cannot overwrite newer results.
    this.searchControl.valueChanges.pipe(
      startWith(''),
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => this.ownerService.searchOwners(q ?? ''))
    ).subscribe(owners => {
      this.owners = owners;
      this.isOwnersDataReceived = true;
    });
  }

  onSelect(owner: Owner) {
    this.router.navigate(['/owners', owner.id]);
  }

  addOwner() {
    this.router.navigate(['/owners/add']);
  }
}
