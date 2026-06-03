import {Component, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {FormControl} from '@angular/forms';
import {OwnerService} from '../owner.service';
import {Owner} from '../owner';
import {ActivatedRoute, Params, Router} from '@angular/router';
import {MatSnackBar} from '@angular/material/snack-bar';
import {MatSort} from '@angular/material/sort';
import {MatPaginator} from '@angular/material/paginator';
import {Subscription, merge} from 'rxjs';
import {debounceTime, distinctUntilChanged, map} from 'rxjs/operators';

const DEFAULT_PAGE = 0;
const DEFAULT_SIZE = 10;

@Component({
  selector: 'app-owner-list',
  templateUrl: './owner-list.component.html',
  styleUrls: ['./owner-list.component.css']
})
export class OwnerListComponent implements OnInit, OnDestroy {
  searchControl = new FormControl('');
  owners: Owner[];
  isOwnersDataReceived: boolean = false;
  isLoading: boolean = false;
  totalElements: number = 0;

  // static: true — neither control sits behind a structural directive (the table is [hidden],
  // not *ngIf'd), so both are available in ngOnInit, before the first change-detection pass.
  @ViewChild(MatSort, {static: true}) sort: MatSort;
  @ViewChild(MatPaginator, {static: true}) paginator: MatPaginator;

  private subscriptions = new Subscription();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private ownerService: OwnerService,
    private snackBar: MatSnackBar
  ) {
  }

  ngOnInit() {
    // queryParams is the single source of truth: every fetch is driven from here.
    this.subscriptions.add(
      this.route.queryParams.subscribe(params => this.onQueryParamsChange(params))
    );

    // User input streams only navigate; they never fetch directly.
    const search$ = this.searchControl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      map(() => 'search' as const)
    );
    const sort$ = this.sort.sortChange.pipe(map(() => 'sort' as const));
    const page$ = this.paginator.page.pipe(map(() => 'page' as const));

    this.subscriptions.add(
      merge(search$, sort$, page$).subscribe(trigger => this.navigateFromControls(trigger))
    );
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  private onQueryParamsChange(params: Params) {
    const q = params['q'] ?? '';
    const page = params['page'] !== undefined ? Number(params['page']) : DEFAULT_PAGE;
    const size = params['size'] !== undefined ? Number(params['size']) : DEFAULT_SIZE;
    const sort: string | undefined = params['sort'];

    // Sync controls from the URL without re-triggering navigation.
    this.searchControl.setValue(q, {emitEvent: false});
    this.paginator.pageIndex = page;
    this.paginator.pageSize = size;
    if (sort) {
      const [active, direction] = sort.split(',');
      this.sort.active = active;
      this.sort.direction = (direction === 'desc' ? 'desc' : 'asc');
    } else {
      this.sort.active = '';
      this.sort.direction = '';
    }

    this.isLoading = true;
    this.ownerService.searchOwners({q, page, size, sort}).subscribe({
      next: ownerPage => {
        this.owners = ownerPage.content;
        this.totalElements = ownerPage.totalElements;
        this.isOwnersDataReceived = true;
        this.isLoading = false;
      },
      error: () => {
        this.snackBar.open('Failed to load owners', 'Close', {duration: 5000});
        this.isLoading = false;
      }
    });
  }

  private navigateFromControls(trigger: 'search' | 'sort' | 'page') {
    // Search/sort/size changes snap back to page 0; paginator page events keep the page.
    const page = trigger === 'page' ? this.paginator.pageIndex : DEFAULT_PAGE;
    const queryParams = this.buildQueryParams({
      q: this.searchControl.value ?? '',
      page,
      size: this.paginator.pageSize,
      active: this.sort.active,
      direction: this.sort.direction
    });
    this.router.navigate([], {relativeTo: this.route, queryParams});
  }

  private buildQueryParams(state: {
    q: string;
    page: number;
    size: number;
    active: string;
    direction: string;
  }): Params {
    const params: Params = {};
    if (state.q) {
      params['q'] = state.q;
    }
    if (state.page !== DEFAULT_PAGE) {
      params['page'] = state.page;
    }
    if (state.size !== DEFAULT_SIZE) {
      params['size'] = state.size;
    }
    if (state.active && state.direction) {
      params['sort'] = `${state.active},${state.direction}`;
    }
    return params;
  }

  isNameSortActive(): boolean {
    return this.sort?.active === 'lastName';
  }

  onSelect(owner: Owner) {
    this.router.navigate(['/owners', owner.id]);
  }

  addOwner() {
    this.router.navigate(['/owners/add']);
  }
}
