"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  RiDashboardLine,
  RiUserAddLine,
  RiBookOpenLine,
  RiCalendarCheckLine,
  RiFilePaperLine,
  RiSettings4Line,
  RiSunLine,
  RiMoonLine,
  RiFilterLine,
  RiMoreLine,
  RiDownloadLine,
  RiCloseLine,
  RiInformationLine,
  RiLoader4Line,
  RiUserLine,
  RiNotificationLine,
  RiShieldCheckLine,
} from "@remixicon/react";

import {
  Button,
  Input,
  InputGroup,
  InputGroupAddon,
  Textarea,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Checkbox,
  RadioGroup,
  RadioGroupItem,
  Switch,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  Alert,
  AlertTitle,
  AlertDescription,
  Separator,
  Skeleton,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
  ScrollArea,
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarRail,
  SidebarInset,
  SidebarTrigger,
  Progress,
  Calendar,
  PageHeader,
  StatusBadge,
  applyTenantBranding,
  resetTenantBranding,
  useTheme,
  cn,
} from "@academic-suite/ui";
import { toast } from "sonner";

// Foundation Spec §5 Typed Module Registry Shape (Mock data)
interface ModuleNavigationItem {
  key: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredPermission?: string;
}

const MOCK_MODULE_REGISTRY: ModuleNavigationItem[] = [
  { key: "dashboard", label: "Dashboard", href: "#overview", icon: RiDashboardLine },
  {
    key: "admissions",
    label: "Admissions",
    href: "#admissions",
    icon: RiUserAddLine,
    requiredPermission: "admissions.applications.view",
  },
  {
    key: "academics",
    label: "Academics",
    href: "#academics",
    icon: RiBookOpenLine,
    requiredPermission: "academics.curriculum.view",
  },
  {
    key: "attendance",
    label: "Attendance",
    href: "#attendance",
    icon: RiCalendarCheckLine,
    requiredPermission: "attendance.sessions.record",
  },
  {
    key: "examination",
    label: "Examinations",
    href: "#examinations",
    icon: RiFilePaperLine,
    requiredPermission: "examinations.evaluations.view",
  },
  {
    key: "settings",
    label: "Settings",
    href: "#settings",
    icon: RiSettings4Line,
    requiredPermission: "platform.settings.manage",
  },
];

// Sample Form Schema
const sampleFormSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters."),
  email: z.string().email("Please enter a valid email address."),
  department: z.string().min(1, "Please select a department."),
  regulation: z.string().min(1, "Please select a regulation."),
  agreeToTerms: z.boolean().refine((val) => val === true, {
    message: "You must agree to the institutional policy.",
  }),
});

type SampleFormValues = z.infer<typeof sampleFormSchema>;

// Dense Table Sample Data (25 rows)
interface StudentRecord {
  id: string;
  admissionNo: string;
  name: string;
  malayalamName: string;
  branch: string;
  semester: string;
  attendance: number;
  status: "success" | "warning" | "danger" | "info" | "neutral";
  statusText: string;
}

const SAMPLE_STUDENTS: StudentRecord[] = [
  { id: "1", admissionNo: "2024-ME-01", name: "Abhijith Nair", malayalamName: "അഭിജിത്ത് നായർ", branch: "Mechanical", semester: "S4", attendance: 92, status: "success", statusText: "Eligible" },
  { id: "2", admissionNo: "2024-CT-02", name: "Ananya Suresh", malayalamName: "അനന്യ സുരേഷ്", branch: "Computer Tech", semester: "S4", attendance: 88, status: "success", statusText: "Eligible" },
  { id: "3", admissionNo: "2024-EE-03", name: "Basil Varghese", malayalamName: "ബേസിൽ വർഗീസ്", branch: "Electrical", semester: "S4", attendance: 74, status: "warning", statusText: "Condonation" },
  { id: "4", admissionNo: "2024-CE-04", name: "Deepa Menon", malayalamName: "ദീപ മേനോൻ", branch: "Civil", semester: "S4", attendance: 95, status: "success", statusText: "Eligible" },
  { id: "5", admissionNo: "2024-EC-05", name: "Farhan Ali", malayalamName: "ഫർഹാൻ അലി", branch: "Electronics", semester: "S4", attendance: 62, status: "danger", statusText: "Detained" },
  { id: "6", admissionNo: "2024-CT-06", name: "Gopika Krishnan", malayalamName: "ഗോപിക കൃഷ്ണൻ", branch: "Computer Tech", semester: "S4", attendance: 84, status: "success", statusText: "Eligible" },
  { id: "7", admissionNo: "2024-ME-07", name: "Harikrishnan P", malayalamName: "ഹരികൃഷ്ണൻ പി", branch: "Mechanical", semester: "S4", attendance: 78, status: "info", statusText: "Review" },
  { id: "8", admissionNo: "2024-CE-08", name: "Irfan K", malayalamName: "ഇർഫാൻ കെ", branch: "Civil", semester: "S4", attendance: 91, status: "success", statusText: "Eligible" },
  { id: "9", admissionNo: "2024-EE-09", name: "Jeevitha S", malayalamName: "ജീവിത എസ്", branch: "Electrical", semester: "S4", attendance: 81, status: "success", statusText: "Eligible" },
  { id: "10", admissionNo: "2024-CT-10", name: "Karthik Raj", malayalamName: "കാർത്തിക് രാജ്", branch: "Computer Tech", semester: "S4", attendance: 69, status: "danger", statusText: "Detained" },
  { id: "11", admissionNo: "2024-EC-11", name: "Lekshmi Priya", malayalamName: "ലക്ഷ്മി പ്രിയ", branch: "Electronics", semester: "S4", attendance: 96, status: "success", statusText: "Eligible" },
  { id: "12", admissionNo: "2024-ME-12", name: "Muhammed Rashid", malayalamName: "മുഹമ്മദ് റഷീദ്", branch: "Mechanical", semester: "S4", attendance: 76, status: "warning", statusText: "Condonation" },
  { id: "13", admissionNo: "2024-CE-13", name: "Nandana Ramesh", malayalamName: "നന്ദന രമേശ്", branch: "Civil", semester: "S4", attendance: 89, status: "success", statusText: "Eligible" },
  { id: "14", admissionNo: "2024-EE-14", name: "Pranav M", malayalamName: "പ്രണവ് എം", branch: "Electrical", semester: "S4", attendance: 85, status: "success", statusText: "Eligible" },
  { id: "15", admissionNo: "2024-CT-15", name: "Rithika Thomas", malayalamName: "റിഥിക തോമസ്", branch: "Computer Tech", semester: "S4", attendance: 94, status: "success", statusText: "Eligible" },
  { id: "16", admissionNo: "2024-EC-16", name: "Sanjay Kumar", malayalamName: "സഞ്ജയ് കുമാർ", branch: "Electronics", semester: "S4", attendance: 72, status: "warning", statusText: "Condonation" },
  { id: "17", admissionNo: "2024-ME-17", name: "Sneha Balan", malayalamName: "സ്നേഹ ബാലൻ", branch: "Mechanical", semester: "S4", attendance: 90, status: "success", statusText: "Eligible" },
  { id: "18", admissionNo: "2024-CE-18", name: "Thejus Joseph", malayalamName: "തേജസ് ജോസഫ്", branch: "Civil", semester: "S4", attendance: 58, status: "danger", statusText: "Detained" },
  { id: "19", admissionNo: "2024-EE-19", name: "Uma Maheshwari", malayalamName: "ഉമാ മഹേശ്വരി", branch: "Electrical", semester: "S4", attendance: 87, status: "success", statusText: "Eligible" },
  { id: "20", admissionNo: "2024-CT-20", name: "Varun Chandran", malayalamName: "വരുൺ ചന്ദ്രൻ", branch: "Computer Tech", semester: "S4", attendance: 93, status: "success", statusText: "Eligible" },
  { id: "21", admissionNo: "2024-EC-21", name: "Vishnu Prasad", malayalamName: "വിഷ്ണു പ്രസാദ്", branch: "Electronics", semester: "S4", attendance: 79, status: "neutral", statusText: "Pending" },
  { id: "22", admissionNo: "2024-ME-22", name: "Yadhu Krishna", malayalamName: "യദുകൃഷ്ണ", branch: "Mechanical", semester: "S4", attendance: 83, status: "success", statusText: "Eligible" },
  { id: "23", admissionNo: "2024-CE-23", name: "Zainab Beevi", malayalamName: "സൈനബ ബീവി", branch: "Civil", semester: "S4", attendance: 97, status: "success", statusText: "Eligible" },
  { id: "24", admissionNo: "2024-EE-24", name: "Akash Mohan", malayalamName: "ആകാശ് മോഹൻ", branch: "Electrical", semester: "S4", attendance: 65, status: "danger", statusText: "Detained" },
  { id: "25", admissionNo: "2024-CT-25", name: "Devika Gopan", malayalamName: "ദേവിക ഗോപൻ", branch: "Computer Tech", semester: "S4", attendance: 91, status: "success", statusText: "Eligible" },
];

export function DesignSystemShowcase() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState(() => {
    if (typeof window !== "undefined") {
      const param = new URLSearchParams(window.location.search).get("tab");
      if (param) return param;
    }
    return "overview";
  });
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(new Date());
  const [activeNav, setActiveNav] = React.useState("dashboard");

  // Tenant Branding Playground State
  const [customPrimary, setCustomPrimary] = React.useState("#0b6e4f");
  const [customPrimaryFg, setCustomPrimaryFg] = React.useState("#ffffff");
  const [brandingFeedback, setBrandingFeedback] = React.useState<{
    success?: boolean;
    ratio?: number;
    message?: string;
  } | null>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Dev Showcase-Only 'd' Hotkey Toggle (WCAG 2.1.4 compliant with typing & modifier guards)
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "d") return;

      const target = event.target;
      if (target instanceof HTMLElement) {
        if (
          target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.closest("input, textarea, select, [contenteditable='true']")
        ) {
          return;
        }
      }

      setTheme(resolvedTheme === "dark" ? "light" : "dark");
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [resolvedTheme, setTheme]);

  // Form handling
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<SampleFormValues>({
    resolver: zodResolver(sampleFormSchema),
    defaultValues: {
      fullName: "",
      email: "",
      department: "Computer Technology",
      regulation: "R26",
      agreeToTerms: false,
    },
  });

  const onFormSubmit = (data: SampleFormValues) => {
    toast.success("Form validated successfully!", {
      description: `Name: ${data.fullName}, Dept: ${data.department}, Reg: ${data.regulation}`,
    });
    reset();
  };

  const handleApplyBranding = () => {
    const result = applyTenantBranding({
      primary: customPrimary,
      primaryForeground: customPrimaryFg,
      ring: customPrimary,
    });

    if (result.success) {
      const primaryVsFg = result.checks?.["light_primary_vs_foreground"]?.ratio ?? 4.5;
      setBrandingFeedback({
        success: true,
        ratio: primaryVsFg,
        message: `Tenant branding applied across Light & Dark themes! Primary vs text contrast: ${primaryVsFg}:1 (WCAG AA Compliant).`,
      });
      toast.success("Tenant Branding Applied", {
        description: `Theme overrides injected into stylesheet cascade with contrast ratio ${primaryVsFg}:1.`,
      });
    } else {
      setBrandingFeedback({
        success: false,
        message: result.reason,
      });
      toast.error("Branding Rejected", {
        description: result.reason,
      });
    }
  };

  const handleResetBranding = () => {
    resetTenantBranding();
    setCustomPrimary("#0b6e4f");
    setCustomPrimaryFg("#ffffff");
    setBrandingFeedback(null);
    toast.info("Preset Defaults Restored", {
      description: "Root tokens reverted to preset b2BnwmRcY defaults.",
    });
  };

  if (!mounted) {
    return null;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background text-foreground antialiased">
        {/* Mock App Shell Sidebar driven by typed Module Registry */}
        <Sidebar className="border-r border-sidebar-border bg-sidebar" collapsible="icon">
          <SidebarHeader className="border-b border-sidebar-border p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-bold">
                CL
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="font-semibold text-sidebar-foreground truncate">
                  CampusLynk
                </span>
                <span className="text-xs text-sidebar-accent-foreground/70 truncate">
                  Academic Suite • v3
                </span>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className="p-2">
            <div className="px-2 py-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              Module Registry (Mock)
            </div>
            <SidebarMenu>
              {MOCK_MODULE_REGISTRY.map((item) => {
                const IconComponent = item.icon;
                const isActive = activeNav === item.key;
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setActiveNav(item.key)}
                      tooltip={item.label}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                      )}
                    >
                      <IconComponent className="size-4 shrink-0" />
                      <span>{item.label}</span>
                      {item.requiredPermission && (
                        <span className="sr-only">
                          Requires permission: {item.requiredPermission}
                        </span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="border-t border-sidebar-border p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Sprint 0 • Step 3</span>
              <Badge variant="outline" className="text-[10px] font-mono">
                b2BnwmRcY
              </Badge>
            </div>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        {/* Main Application Inset */}
        <SidebarInset className="flex flex-1 flex-col overflow-hidden">
          {/* Top Bar with Sidebar Trigger & Theme Switcher */}
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="size-8" />
              <Separator orientation="vertical" className="h-4" />
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tracking-tight">Design System Showcase</span>
                <StatusBadge status="success">Active Preset</StatusBadge>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                      aria-label="Toggle theme"
                    >
                      {resolvedTheme === "dark" ? (
                        <RiSunLine className="size-4 text-primary" />
                      ) : (
                        <RiMoonLine className="size-4 text-foreground" />
                      )}
                    </Button>
                  }
                />
                <TooltipContent>
                  <p>Toggle Theme (or press &apos;d&apos;)</p>
                </TooltipContent>
              </Tooltip>

              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  toast.info("System Notification", {
                    description: "Sonner toast triggered from top bar.",
                  })
                }
              >
                <RiNotificationLine className="mr-1.5 size-4" />
                Toast Probe
              </Button>
            </div>
          </header>

          {/* Scrollable Main Area */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-8 max-w-7xl mx-auto w-full">
            {/* Composed Page Header with Breadcrumb */}
            <PageHeader
              breadcrumb={
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink href="/">Home</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbLink href="/design-system">Frontend</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>Design System Preset b2BnwmRcY</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              }
              title="Design System & Component Showcase"
              description="Visual identity and interactive component verification for Academic Suite (Kerala Polytechnic Multi-Tenant Management Platform)."
              actions={
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">shadcn CLI v4.23.0</Badge>
                  <Badge variant="outline">Base UI Vega</Badge>
                  <Badge variant="outline">Remix Icon</Badge>
                </div>
              }
            />

            {/* Showcase Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 h-auto p-1 gap-1">
                <TabsTrigger value="overview">Overview & Components</TabsTrigger>
                <TabsTrigger value="forms">Forms & Inputs</TabsTrigger>
                <TabsTrigger value="table">Dense Data Table</TabsTrigger>
                <TabsTrigger value="malayalam">Malayalam Typography</TabsTrigger>
                <TabsTrigger value="branding">Tenant Branding</TabsTrigger>
              </TabsList>

              {/* TAB 1: OVERVIEW & COMPONENTS */}
              <TabsContent value="overview" className="space-y-8">
                {/* Standard Alert Demonstration */}
                <Alert>
                  <RiInformationLine className="size-4" />
                  <AlertTitle>Sprint 0 Step 3 Preset Active</AlertTitle>
                  <AlertDescription>
                    Design system installed from shadcn preset <code>b2BnwmRcY</code> in <code>packages/ui</code> with Base UI primitives and OKLCH color tokens.
                  </AlertDescription>
                </Alert>

                {/* Semantic Status Badges */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Composed Status Badges & Tokens</CardTitle>
                    <CardDescription>
                      Mapped strictly to semantic preset tokens without hard-coded hex values.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-3">
                    <StatusBadge status="success">Eligible / Pass</StatusBadge>
                    <StatusBadge status="warning">Condonation Required</StatusBadge>
                    <StatusBadge status="danger">Detained / Failed</StatusBadge>
                    <StatusBadge status="info">Under Evaluation</StatusBadge>
                    <StatusBadge status="neutral">Draft / Inactive</StatusBadge>
                  </CardContent>
                </Card>

                {/* Buttons Grid */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Buttons (All Variants, Sizes & States)</CardTitle>
                    <CardDescription>
                      Default, hover, active, focus-visible, disabled and loading states.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex flex-wrap items-center gap-3">
                      <Button variant="default">Primary Action</Button>
                      <Button variant="secondary">Secondary</Button>
                      <Button variant="outline">Outline</Button>
                      <Button variant="ghost">Ghost</Button>
                      <Button variant="destructive">Destructive</Button>
                      <Button variant="link">Link Style</Button>
                    </div>

                    <Separator />

                    <div className="flex flex-wrap items-center gap-3">
                      <Button size="xs">Extra Small (xs)</Button>
                      <Button size="sm">Small (sm)</Button>
                      <Button size="default">Default</Button>
                      <Button size="lg">Large (lg)</Button>
                      <Button size="icon" aria-label="Settings icon">
                        <RiSettings4Line className="size-4" />
                      </Button>
                    </div>

                    <Separator />

                    <div className="flex flex-wrap items-center gap-3">
                      <Button disabled>Disabled Action</Button>
                      <Button disabled className="gap-2">
                        <RiLoader4Line className="size-4 animate-spin" />
                        Loading...
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Command Palette & ScrollArea */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Command Palette & ScrollArea</CardTitle>
                    <CardDescription>
                      Accessible command search container with custom scrollable region.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-6 md:grid-cols-2">
                    <div className="rounded-lg border shadow-xs">
                      <Command className="rounded-lg border shadow-md">
                        <CommandInput placeholder="Type a command or search modules..." />
                        <CommandList>
                          <CommandEmpty>No results found.</CommandEmpty>
                          <CommandGroup heading="Modules">
                            <CommandItem onSelect={() => toast.info("Navigated to Dashboard")}>
                              <RiDashboardLine className="mr-2 size-4" /> Dashboard
                            </CommandItem>
                            <CommandItem onSelect={() => toast.info("Navigated to Academics")}>
                              <RiBookOpenLine className="mr-2 size-4" /> Academics & Syllabus
                            </CommandItem>
                            <CommandItem onSelect={() => toast.info("Navigated to Attendance")}>
                              <RiCalendarCheckLine className="mr-2 size-4" /> Attendance Register
                            </CommandItem>
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs uppercase font-semibold text-muted-foreground">
                        Custom ScrollArea Container
                      </Label>
                      <ScrollArea className="h-44 w-full rounded-md border p-3">
                        <div className="space-y-3 text-xs">
                          <p className="font-semibold text-primary">Academic Calendar Milestones (S4 / S6):</p>
                          <p>• Week 01: Commencement of classes and orientation for 2024 batch.</p>
                          <p>• Week 04: First Continuous Internal Assessment (CIA-1) marks entry.</p>
                          <p>• Week 08: Mid-term attendance audit & condonation review.</p>
                          <p>• Week 12: Second Continuous Internal Assessment (CIA-2) evaluation.</p>
                          <p>• Week 16: Final attendance consolidation and hall ticket publishing.</p>
                          <p>• Week 18: End Semester Examination (ESE) conduct under SBTE Kerala.</p>
                        </div>
                      </ScrollArea>
                    </div>
                  </CardContent>
                </Card>

                {/* Overlays, Dialogs, Sheet & Popovers */}
                <div className="grid gap-6 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Modals & Sheets</CardTitle>
                      <CardDescription>
                        Accessible dialogs, confirmation modals and slide-out sidebars.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-3">
                      {/* Standard Dialog */}
                      <Dialog>
                        <DialogTrigger
                          render={<Button variant="outline">Open Modal Dialog</Button>}
                        />
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Student Verification</DialogTitle>
                            <DialogDescription>
                              Verify attendance record and internal assessment split before submission.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="py-3 text-sm text-muted-foreground">
                            Dialog is fully keyboard accessible with ESC to close and focus trapping.
                          </div>
                          <DialogFooter>
                            <DialogClose
                              render={<Button variant="outline">Close</Button>}
                            />
                            <Button onClick={() => toast.success("Record verified!")}>Confirm</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      {/* Alert Dialog */}
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={<Button variant="destructive">Delete Record</Button>}
                        />
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action will permanently delete the draft mark allocation. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => toast.error("Record deleted.")}>
                              Delete Permanently
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      {/* Sheet */}
                      <Sheet>
                        <SheetTrigger
                          render={<Button variant="secondary">Open Slide Sheet</Button>}
                        />
                        <SheetContent>
                          <SheetHeader>
                            <SheetTitle>Audit Trail Inspector</SheetTitle>
                            <SheetDescription>
                              Review recent mark modification events and timestamp logs.
                            </SheetDescription>
                          </SheetHeader>
                          <div className="py-6 space-y-4 text-sm">
                            <p className="text-muted-foreground">
                              Slide sheets provide full-height side panels for inspection on mobile and desktop.
                            </p>
                            <div className="rounded-lg border p-3 space-y-1">
                              <span className="text-xs font-semibold uppercase text-muted-foreground">
                                Last Updated
                              </span>
                              <p className="font-mono text-xs">2026-11-01 22:45 IST by HOD_ME</p>
                            </div>
                          </div>
                          <SheetFooter>
                            <SheetClose
                              render={<Button variant="outline">Dismiss</Button>}
                            />
                          </SheetFooter>
                        </SheetContent>
                      </Sheet>
                    </CardContent>
                  </Card>

                  {/* Menus, Popover & Tooltip */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Menus, Popover & Tooltip</CardTitle>
                      <CardDescription>
                        Interactive dropdown menus, command search and contextual popups.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-3">
                      {/* Dropdown Menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="outline">
                              Options Menu
                              <RiMoreLine className="ml-1.5 size-4" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="start">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => toast.info("Exporting marks...")}>
                            <RiDownloadLine className="mr-2 size-4" /> Export CSV
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toast.info("Audit trail opened")}>
                            <RiShieldCheckLine className="mr-2 size-4" /> Audit History
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive">
                            <RiCloseLine className="mr-2 size-4" /> Reset Batch
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* Popover */}
                      <Popover>
                        <PopoverTrigger
                          render={<Button variant="outline">Information Popover</Button>}
                        />
                        <PopoverContent className="w-80">
                          <div className="space-y-2">
                            <h4 className="font-semibold text-sm">Regulation R26 Rule</h4>
                            <p className="text-xs text-muted-foreground">
                              Internal assessment minimum pass mark is 40% in each continuous evaluation component.
                            </p>
                          </div>
                        </PopoverContent>
                      </Popover>

                      {/* Tooltip */}
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button variant="secondary" size="icon" aria-label="Info icon">
                              <RiInformationLine className="size-4" />
                            </Button>
                          }
                        />
                        <TooltipContent>
                          <p>Accessible tooltip with Base UI positioning</p>
                        </TooltipContent>
                      </Tooltip>
                    </CardContent>
                  </Card>
                </div>

                {/* Progress, Skeleton, Calendar & Avatars */}
                <div className="grid gap-6 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Progress, Skeletons & Avatars</CardTitle>
                      <CardDescription>
                        Visual loading states and indicators.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-medium">
                          <span>Semester Evaluation Progress</span>
                          <span>75%</span>
                        </div>
                        <Progress value={75} />
                      </div>

                      <Separator />

                      <div className="flex items-center space-x-4">
                        <Skeleton className="size-12 rounded-full" />
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-4 w-1/2" />
                        </div>
                      </div>

                      <Separator />

                      <div className="flex items-center gap-4">
                        <div className="flex -space-x-2">
                          <Avatar className="ring-2 ring-background">
                            <AvatarImage src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop" />
                            <AvatarFallback>AN</AvatarFallback>
                          </Avatar>
                          <Avatar className="ring-2 ring-background">
                            <AvatarFallback>BV</AvatarFallback>
                          </Avatar>
                          <Avatar className="ring-2 ring-background">
                            <AvatarFallback>DM</AvatarFallback>
                          </Avatar>
                        </div>
                        <span className="text-xs text-muted-foreground">Institutional Faculty Avatars</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Calendar Component</CardTitle>
                      <CardDescription>
                        Interactive date selection with custom styles.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center justify-center p-2">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={setSelectedDate}
                        className="rounded-md border shadow-xs"
                      />
                      <p className="text-xs text-muted-foreground mt-3 font-mono">
                        Selected: {selectedDate ? selectedDate.toLocaleDateString("en-IN") : "None"}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* TAB 2: FORMS & INPUT CONTROLS */}
              <TabsContent value="forms" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Form Validation (react-hook-form + Zod)</CardTitle>
                    <CardDescription>
                      Full validation lifecycle with input states (default, hover, focus, error, disabled).
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6 max-w-xl">
                      {/* Full Name Input */}
                      <div className="space-y-2">
                        <Label htmlFor="fullName">Full Name</Label>
                        <Input
                          id="fullName"
                          placeholder="e.g. Anandhu Krishnan"
                          {...register("fullName")}
                          aria-invalid={!!errors.fullName}
                        />
                        {errors.fullName && (
                          <p className="text-xs text-destructive font-medium">
                            {errors.fullName.message}
                          </p>
                        )}
                      </div>

                      {/* Email Input with InputGroup */}
                      <div className="space-y-2">
                        <Label htmlFor="email">Official Email</Label>
                        <InputGroup>
                          <InputGroupAddon>
                            <RiUserLine className="size-4 text-muted-foreground" />
                          </InputGroupAddon>
                          <Input
                            id="email"
                            type="email"
                            placeholder="staff@college.edu.in"
                            {...register("email")}
                            aria-invalid={!!errors.email}
                          />
                        </InputGroup>
                        {errors.email && (
                          <p className="text-xs text-destructive font-medium">
                            {errors.email.message}
                          </p>
                        )}
                      </div>

                      {/* Department Select */}
                      <div className="space-y-2">
                        <Label>Department</Label>
                        <Select
                          defaultValue="Computer Technology"
                          onValueChange={(val) => {
                            if (typeof val === "string") {
                              setValue("department", val, { shouldValidate: true });
                            }
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select Department" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Computer Technology">Computer Technology</SelectItem>
                            <SelectItem value="Mechanical Engineering">Mechanical Engineering</SelectItem>
                            <SelectItem value="Electrical Engineering">Electrical Engineering</SelectItem>
                            <SelectItem value="Civil Engineering">Civil Engineering</SelectItem>
                            <SelectItem value="Electronics Engineering">Electronics Engineering</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Regulation Radio Group */}
                      <div className="space-y-2">
                        <Label>Regulation Scheme</Label>
                        <RadioGroup
                          defaultValue="R26"
                          onValueChange={(val) => setValue("regulation", val, { shouldValidate: true })}
                          className="flex gap-4"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="R26" id="r26" />
                            <Label htmlFor="r26" className="font-normal">Regulation 2026 (R26)</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="R21" id="r21" />
                            <Label htmlFor="r21" className="font-normal">Regulation 2021 (R21)</Label>
                          </div>
                        </RadioGroup>
                      </div>

                      {/* Textarea */}
                      <div className="space-y-2">
                        <Label htmlFor="remarks">Remarks / Reason (Optional)</Label>
                        <Textarea id="remarks" placeholder="Enter academic notes..." rows={3} />
                      </div>

                      {/* Switches and Checkboxes */}
                      <div className="space-y-4 rounded-lg border p-4 bg-muted/20">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label htmlFor="autoNotify">SMS & Email Notifications</Label>
                            <p className="text-xs text-muted-foreground">
                              Send instant alerts to students and guardians.
                            </p>
                          </div>
                          <Switch id="autoNotify" defaultChecked />
                        </div>

                        <Separator />

                        <div className="flex items-start space-x-2">
                          <Checkbox
                            id="agreeToTerms"
                            checked={watch("agreeToTerms")}
                            onCheckedChange={(checked) =>
                              setValue("agreeToTerms", !!checked, { shouldValidate: true })
                            }
                          />
                          <div className="grid gap-1.5 leading-none">
                            <Label htmlFor="agreeToTerms" className="text-sm font-normal">
                              I confirm these internal marks adhere to Regulation R26 guidelines.
                            </Label>
                            {errors.agreeToTerms && (
                              <p className="text-xs text-destructive font-medium">
                                {errors.agreeToTerms.message}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <Button type="submit">Submit & Validate</Button>
                        <Button type="button" variant="outline" onClick={() => reset()}>
                          Reset Form
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* TAB 3: DENSE DATA TABLE (20+ ROWS) */}
              <TabsContent value="table" className="space-y-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                    <div>
                      <CardTitle className="text-lg">Student Attendance & Marks Register</CardTitle>
                      <CardDescription>
                        Dense polytechnic staff view with sticky headers, search and action menus (25 records).
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm">
                        <RiFilterLine className="mr-1.5 size-4" /> Filter
                      </Button>
                      <Button variant="default" size="sm">
                        <RiDownloadLine className="mr-1.5 size-4" /> Export CSV
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="relative max-h-[500px] overflow-auto border-t border-border">
                      <Table className="w-full text-xs">
                        <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur z-10">
                          <TableRow>
                            <TableHead className="w-[120px] font-semibold">Adm No</TableHead>
                            <TableHead className="font-semibold">Student Name (English)</TableHead>
                            <TableHead className="font-semibold">പേര് (Malayalam)</TableHead>
                            <TableHead className="w-[130px] font-semibold">Branch</TableHead>
                            <TableHead className="w-[70px] font-semibold text-center">Sem</TableHead>
                            <TableHead className="w-[110px] font-semibold text-right">Attendance %</TableHead>
                            <TableHead className="w-[120px] font-semibold text-center">Status</TableHead>
                            <TableHead className="w-[60px] text-right"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {SAMPLE_STUDENTS.map((student) => (
                            <TableRow key={student.id} className="hover:bg-muted/50 transition-colors">
                              <TableCell className="font-mono font-medium">{student.admissionNo}</TableCell>
                              <TableCell className="font-medium text-foreground">{student.name}</TableCell>
                              <TableCell className="text-foreground/90 font-normal">{student.malayalamName}</TableCell>
                              <TableCell className="text-muted-foreground">{student.branch}</TableCell>
                              <TableCell className="text-center font-mono">{student.semester}</TableCell>
                              <TableCell className="text-right font-mono font-semibold">
                                <span className={student.attendance < 75 ? "text-destructive" : "text-primary"}>
                                  {student.attendance}%
                                </span>
                              </TableCell>
                              <TableCell className="text-center">
                                <StatusBadge status={student.status} showDot={false}>
                                  {student.statusText}
                                </StatusBadge>
                              </TableCell>
                              <TableCell className="text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger
                                    render={
                                      <Button variant="ghost" size="icon-xs" aria-label="Row options">
                                        <RiMoreLine className="size-3.5" />
                                      </Button>
                                    }
                                  />
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => toast.info(`Viewing profile: ${student.name}`)}>
                                      View Profile
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => toast.info(`Enter marks for: ${student.admissionNo}`)}>
                                      Enter Marks
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                  <CardFooter className="flex items-center justify-between border-t p-4 text-xs text-muted-foreground">
                    <span>Showing 25 of 120 students in Batch 2024-27</span>
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious href="#" />
                        </PaginationItem>
                        <PaginationItem>
                          <PaginationLink href="#" isActive>1</PaginationLink>
                        </PaginationItem>
                        <PaginationItem>
                          <PaginationLink href="#">2</PaginationLink>
                        </PaginationItem>
                        <PaginationItem>
                          <PaginationEllipsis />
                        </PaginationItem>
                        <PaginationItem>
                          <PaginationNext href="#" />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </CardFooter>
                </Card>
              </TabsContent>

              {/* TAB 4: MALAYALAM TYPOGRAPHY VERIFICATION */}
              <TabsContent value="malayalam" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl">മലയാളം ഫോണ്ട് റെൻഡറിംഗ് (Noto Sans Malayalam)</CardTitle>
                    <CardDescription>
                      Verification of Malayalam script support, typography weights, conjuncts, and unbroken word handling.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Headings */}
                    <div className="space-y-2 border-l-4 border-primary pl-4">
                      <h2 className="text-2xl font-bold tracking-tight text-foreground">
                        അക്കാദമിക് മാനേജ്‌മെന്റ് സിസ്റ്റം
                      </h2>
                      <h3 className="text-lg font-semibold text-primary">
                        കേരള സർക്കാർ സാങ്കേതിക വിദ്യാഭ്യാസ വകുപ്പ്
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        കേരളത്തിലെ പോളിടെക്നിക് കോളേജുകൾക്കായുള്ള സമ്പൂർണ്ണ ഡിജിറ്റൽ മാനേജ്‌മെന്റ് പ്ലാറ്റ്‌ഫോം.
                        വിദ്യാർത്ഥികളുടെ അഡ്മിഷൻ, ഹാജർ നില, ഇന്റേണൽ അസസ്‌മെന്റ്, പരീക്ഷാഫലങ്ങൾ എന്നിവ കാര്യക്ഷമമായി കൈകാര്യം ചെയ്യാൻ സഹായിക്കുന്നു.
                      </p>
                    </div>

                    <Separator />

                    {/* Malayalam Buttons */}
                    <div className="space-y-2">
                      <Label className="text-xs uppercase font-semibold text-muted-foreground">
                        ബട്ടണുകൾ (Malayalam Buttons)
                      </Label>
                      <div className="flex flex-wrap gap-3">
                        <Button variant="default">സമർപ്പിക്കുക (Submit)</Button>
                        <Button variant="secondary">സംരക്ഷിക്കുക (Save)</Button>
                        <Button variant="outline">ഡൗൺലോഡ് (Download)</Button>
                        <Button variant="destructive">റദ്ദാക്കുക (Cancel)</Button>
                      </div>
                    </div>

                    <Separator />

                    {/* Long Unbroken Word Test */}
                    <div className="space-y-2">
                      <Label className="text-xs uppercase font-semibold text-muted-foreground">
                        ദീർഘമായ വാക്കുകളുടെ പരിശോധന (Long Unbroken Word Test)
                      </Label>
                      <div className="p-4 rounded-lg bg-muted/40 border space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <span className="text-sm font-semibold">സാങ്കേതികവിദ്യാഭ്യാസവകുപ്പ്</span>
                          <StatusBadge status="info">വിദ്യാഭ്യാസ സ്ഥാപനങ്ങൾ</StatusBadge>
                        </div>
                        <p className="text-xs font-mono text-muted-foreground break-words">
                          പരിശോധനാ വാക്ക്: &quot;ഉത്തരവാദിത്തത്തോടുകൂടിയുള്ള&quot; (With great responsibility) —
                          അക്ഷരങ്ങൾ ശരിയായ അകലത്തിലും വിന്യാസത്തിലും റെൻഡർ ചെയ്യപ്പെടുന്നു എന്ന് ഉറപ്പുവരുത്തുന്നു.
                        </p>
                        <p className="text-sm font-medium">
                          പ്രവേശനപരീക്ഷാനടത്തിപ്പുമായി ബന്ധപ്പെട്ട അറിയിപ്പുകൾ ഉടൻ പ്രസിദ്ധീകരിക്കുന്നതാണ്.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* TAB 5: TENANT BRANDING PLAYGROUND */}
              <TabsContent value="branding" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Tenant Branding & WCAG AA Contrast Playground</CardTitle>
                    <CardDescription>
                      Colleges can customize primary colors at runtime. Contrast is strictly validated (minimum 4.5:1 required).
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-6 sm:grid-cols-2 max-w-xl">
                      <div className="space-y-2">
                        <Label htmlFor="primaryColor">Primary Color (Hex or OKLCH)</Label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={customPrimary.startsWith("#") ? customPrimary : "#0b6e4f"}
                            onChange={(e) => setCustomPrimary(e.target.value)}
                            className="size-9 rounded border cursor-pointer p-0.5"
                          />
                          <Input
                            id="primaryColor"
                            value={customPrimary}
                            onChange={(e) => setCustomPrimary(e.target.value)}
                            placeholder="#0b6e4f or oklch(...)"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="primaryFgColor">Primary Foreground Text Color</Label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={customPrimaryFg.startsWith("#") ? customPrimaryFg : "#ffffff"}
                            onChange={(e) => setCustomPrimaryFg(e.target.value)}
                            className="size-9 rounded border cursor-pointer p-0.5"
                          />
                          <Input
                            id="primaryFgColor"
                            value={customPrimaryFg}
                            onChange={(e) => setCustomPrimaryFg(e.target.value)}
                            placeholder="#ffffff or oklch(...)"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button onClick={handleApplyBranding}>Apply Custom Theme</Button>
                      <Button variant="outline" onClick={handleResetBranding}>
                        Reset to Preset Default
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          // Low contrast test pair
                          setCustomPrimary("#6ee7b7");
                          setCustomPrimaryFg("#ffffff");
                        }}
                      >
                        Load Low-Contrast Fail Test (#6ee7b7 on #fff)
                      </Button>
                    </div>

                    {brandingFeedback && (
                      <Alert variant={brandingFeedback.success ? "default" : "destructive"}>
                        <AlertTitle>
                          {brandingFeedback.success ? "WCAG AA Contrast Validated" : "Contrast Check Failed"}
                        </AlertTitle>
                        <AlertDescription>{brandingFeedback.message}</AlertDescription>
                      </Alert>
                    )}

                    <div className="rounded-lg border p-4 space-y-3">
                      <h4 className="text-sm font-semibold">Live Preview with Active Tokens:</h4>
                      <div className="flex flex-wrap gap-3 items-center">
                        <Button>Live Primary Button</Button>
                        <StatusBadge status="success">Live Success Badge</StatusBadge>
                        <Badge variant="default">Default Badge</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
