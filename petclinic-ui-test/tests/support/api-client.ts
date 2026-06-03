import axios, { AxiosInstance } from 'axios';

export interface PetDto {
  id?: number;
  name: string;
}

export interface OwnerDto {
  firstName: string;
  lastName: string;
  id?: number;
  address?: string;
  city?: string;
  telephone?: string;
  pets?: PetDto[];
}

export interface VisitDto {
  id: number;
  date: string;
  description: string;
  petId: number;
  petName?: string;
  ownerId?: number;
  ownerFirstName?: string;
  ownerLastName?: string;
}

export interface PageDto<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export class ApiClient {
  private client: AxiosInstance;

  constructor(baseUrl: string = process.env.API_BASE_URL || 'http://localhost:8080/api') {
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 10000,
    });
  }

  // GET /api/owners returns a page envelope. Without params this is the same
  // first page (size 10, id-ascending) the owners screen displays on load, so
  // UI-vs-API comparisons stay aligned with what the table actually shows.
  async fetchOwners(): Promise<OwnerDto[]> {
    const response = await this.client.get<PageDto<OwnerDto>>('/owners');
    return response.data.content;
  }

  async fetchOwnersByQuery(q: string): Promise<OwnerDto[]> {
    const response = await this.client.get<PageDto<OwnerDto>>('/owners', {
      params: { q }
    });
    return response.data.content;
  }

  async fetchVisits(): Promise<VisitDto[]> {
    const response = await this.client.get<VisitDto[]>('/visits');
    return response.data;
  }

  static getFullNames(owners: OwnerDto[]): string[] {
    return owners
      .map(owner => `${owner.firstName} ${owner.lastName}`.trim())
      .filter(name => name.length > 0);
  }

  static sorted(values: string[]): string[] {
    return [...values].sort();
  }

  static sortedByDate<T extends { date: string }>(rows: T[]): T[] {
    return [...rows].sort((a, b) => a.date.localeCompare(b.date));
  }

}
