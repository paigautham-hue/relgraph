import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Handshake,
  MessageSquare,
  Globe,
  TrendingUp,
  TrendingDown,
  ArrowRight,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const STRENGTH_COLORS = [
  { name: "Dormant", color: "var(--strength-dormant)" },
  { name: "Acquaintance", color: "var(--strength-acquaintance)" },
  { name: "Active", color: "var(--strength-active)" },
  { name: "Strong", color: "var(--strength-strong)" },
  { name: "Champion", color: "var(--strength-champion)" },
];

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ElementType;
  loading?: boolean;
}

function MetricCard({
  title,
  value,
  change,
  icon: Icon,
  loading,
}: MetricCardProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="mt-3 h-8 w-20" />
          <Skeleton className="mt-1 h-4 w-28" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--relgraph-primary-light)]">
            <Icon className="h-5 w-5 text-[var(--relgraph-primary)]" />
          </div>
          {change != null && (
            <span
              className={`flex items-center gap-0.5 text-xs font-medium ${
                change >= 0 ? "text-green-600" : "text-red-500"
              }`}
            >
              {change >= 0 ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}
              {Math.abs(change)}%
            </span>
          )}
        </div>
        <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
        <p className="mt-1 text-sm text-muted-foreground">{title}</p>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const statsQuery = trpc.dashboard.stats.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const stats = statsQuery.data;
  const loading = statsQuery.isLoading;
  const statsAny = (stats as any) ?? {};

  const fallbackStrengthDistribution = [
    { name: "Dormant", value: 12 },
    { name: "Acquaintance", value: 28 },
    { name: "Active", value: 35 },
    { name: "Strong", value: 18 },
    { name: "Champion", value: 7 },
  ];

  const rawStrengthDistribution = statsAny.strengthDistribution;
  const strengthDistribution = Array.isArray(rawStrengthDistribution)
    ? rawStrengthDistribution
        .map((item: any) => ({
          name: item?.name ?? item?.label ?? "Unknown",
          value: Number(item?.value ?? item?.count ?? 0),
        }))
        .filter((item) => Number.isFinite(item.value))
    : rawStrengthDistribution && typeof rawStrengthDistribution === "object"
      ? Object.entries(rawStrengthDistribution).map(([label, value]) => ({
          name: label
            .replace(/_/g, " ")
            .replace(/\b\w/g, (char) => char.toUpperCase()),
          value: Number(value ?? 0),
        }))
      : fallbackStrengthDistribution;

  const rawMonthlyInteractions = statsAny.monthlyInteractions;
  const monthlyInteractions = Array.isArray(rawMonthlyInteractions)
    ? rawMonthlyInteractions.map((item: any) => ({
        month: item?.month ?? item?.label ?? "Unknown",
        count: Number(item?.count ?? item?.value ?? 0),
      }))
    : [
        { month: "Oct", count: 42 },
        { month: "Nov", count: 58 },
        { month: "Dec", count: 35 },
        { month: "Jan", count: 64 },
        { month: "Feb", count: 71 },
        { month: "Mar", count: 89 },
      ];

  const recentActivity = Array.isArray(statsAny?.recentActivity)
    ? statsAny.recentActivity
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your relationship intelligence"
      />

      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Contacts"
          value={(stats as any)?.totalContacts ?? 0}
          change={(stats as any)?.contactsChange}
          icon={Users}
          loading={loading}
        />
        <MetricCard
          title="Active Relationships"
          value={(stats as any)?.activeRelationships ?? 0}
          change={(stats as any)?.relationshipsChange}
          icon={Handshake}
          loading={loading}
        />
        <MetricCard
          title="Interactions This Month"
          value={(stats as any)?.interactionsThisMonth ?? 0}
          change={(stats as any)?.interactionsChange}
          icon={MessageSquare}
          loading={loading}
        />
        <MetricCard
          title="Domains"
          value={(stats as any)?.domainCount ?? 0}
          icon={Globe}
          loading={loading}
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-7">
        {/* Monthly Interactions Bar Chart */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle className="text-base">Monthly Interactions</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full rounded-lg" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlyInteractions}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-border"
                  />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      backgroundColor: "var(--card)",
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="var(--relgraph-primary)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Relationship Strength Distribution */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Strength Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full rounded-lg" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={strengthDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {strengthDistribution.map(
                      (_: unknown, index: number) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            STRENGTH_COLORS[
                              index % STRENGTH_COLORS.length
                            ].color
                          }
                        />
                      )
                    )}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      backgroundColor: "var(--card)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
            {/* Legend */}
            {!loading && (
              <div className="mt-2 flex flex-wrap justify-center gap-3">
                {STRENGTH_COLORS.map((item) => (
                  <div key={item.name} className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-xs text-muted-foreground">
                      {item.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-48" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentActivity.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                No recent activity yet
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Start tracking interactions to see activity here
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentActivity.map(
                (
                  activity: {
                    id: string;
                    description: string;
                    timestamp: string;
                    type: string;
                  },
                  index: number
                ) => (
                  <div
                    key={activity.id ?? index}
                    className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">
                        {activity.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {activity.timestamp}
                      </p>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
