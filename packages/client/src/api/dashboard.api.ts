import { api } from '@/store/api';
import type { DashboardResponse } from '@skills-trainer/shared';

const dashboardApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getDashboard: builder.query<DashboardResponse, void>({
      query: () => '/dashboard',
      providesTags: [{ type: 'Dashboard' }],
    }),
  }),
});

export const { useGetDashboardQuery } = dashboardApi;
