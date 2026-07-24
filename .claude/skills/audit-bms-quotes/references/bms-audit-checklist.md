# BMS quotation audit checklist

Use this checklist selectively but cover every applicable category. Record `Included`, `Excluded`, `Missing`, or `Unclear`, plus the source cell/page and financial impact when known.

## 1. Source and commercial controls

- Customer, site, project phase, revision, date, estimator, and quote validity
- Currency, FX date, FX buffer, supplier conversion rule, and price-escalation clause
- Supplier quotation reference, list price, project discount, rebate, and discount expiry
- Freight, insurance, customs, brokerage, local delivery, and procurement handling
- VAT basis and whether every subtotal uses the same tax treatment
- Payment terms, retention, bonds, credit cost, and cash-flow exposure
- Delivery lead time, substitutions, cancellations, and restocking risk
- Target gross margin, markup policy, contingency, and approval authority

## 2. Equipment and software

- Controllers and required base licenses
- I/O modules by signal type: DI, DO, AI, AO, universal, 4–20 mA, pulse, resistance
- Relays, interposing relays, contactors, isolators, transducers, and signal converters
- Power supplies, transformers, fuses, terminals, address keys, bases, and connectors
- Panels, enclosure, panel fabrication, wiring, labeling, and panel-shop labor
- Network switches, routers, gateways, BACnet routers, serial converters, and cabling
- Sensors, actuators, valves, dampers, meters, thermostats, and field devices
- Servers, workstations, displays, UPS, operating system, database, and antivirus requirements
- Head-end software, drivers, integrations, client seats, mobile access, cloud subscription
- Point, device, trend, alarm, history, API, and integration license limits
- Spare I/O, spare controller capacity, and future expansion allowance
- Consumables, accessories, shipping spares, and recommended operational spares

## 3. Engineering and labor

- Design review, drawings, submittals, control schematics, and technical approvals
- Point schedule and I/O database
- Controller database, addressing, network configuration, and backups
- Sequences of operation, PID loops, safeties, interlocks, staging, and optimization
- Alarm classes, routing, schedules, calendars, time programs, and notifications
- HMI graphics, floor plans, plant screens, templates, navigation, and animation
- Trends, reports, dashboards, energy calculations, exports, and user permissions
- Third-party integration mapping, testing, and vendor coordination
- FAT, panel-shop testing, simulator, and witness testing
- Point-to-point field checking, loop checking, SAT, functional testing, and commissioning
- Balancing/commissioning-agent support and consultant/customer witness sessions
- Site mobilization, inductions, permits, security, parking, travel, lodging, and overtime
- Project management, meetings, RFIs, coordination, scheduling, and progress reporting
- Revisions, consultant comments, change allowance, and reprogramming contingency
- As-built drawings, backups, source files, O&M manuals, training, and handover
- Warranty callouts, remote support, software updates, and defect-period reserve

## 4. Time drivers to quantify

- Actual used physical I/O points by type
- Installed channel capacity and spare percentage
- Number and complexity of AHUs, chillers, pumps, boilers, FCUs, VAVs, meters, and plants
- Number of unique sequences versus reusable templates
- Number of HMI screens and custom graphics
- Number of trends, alarms, schedules, reports, users, and permission roles
- Number and type of integrations and mapped third-party points
- Number of panels, remote segments, controllers, sites, and communication trunks
- Planned FAT, SAT, commissioning, training, and return visits
- Working-hour restrictions, occupied-site constraints, phasing, and dependencies

## 5. Technical capacity and topology

- Controller limit for physical I/O, integration points, BACnet objects, programs, alarms, and trends
- Maximum I/O modules, bus length, segment count, address rules, and termination
- Bus and module current consumption versus controller and auxiliary power capacity
- Remote-panel power, grounding, isolation, surge protection, and communication medium
- Signal compatibility and field-device power requirements
- Network address plan, VLAN, ports, certificates, cybersecurity, and remote access
- Server sizing, storage retention, backup, redundancy, and time synchronization
- License definition: physical points, objects, devices, histories, or integrations
- Minimum 10–20% spare capacity unless the tender states another requirement

## 6. Formula and model red flags

- Unit costs summed instead of extended costs
- Quantity included in customer revenue but omitted from internal cost
- Labor price present with blank hours or blank cost
- Subtotals typed manually or ranges that skip rows
- Hidden rows or sheets excluded from totals
- Discount applied twice or interpreted as the payable percentage
- FX applied in the wrong direction or to local-currency items
- Freight and contingency applied to sales instead of cost, or vice versa
- Margin calculated as profit divided by cost instead of revenue
- VAT treated as profit or included in one comparison but not another
- Negative or zero cost on sold items without explanation
- Rounded sell price inconsistent with line total
- Shared cost allocated to only one work package without clear labeling

## 7. Severity and approval gates

Classify findings:

- `Critical`: invalid configuration, negative economics, missing mandatory controller/license, or total-price error
- `High`: material omitted cost, unpriced commissioning, insufficient margin, or unsupported hours
- `Medium`: undocumented assumption, weak formula control, or moderate scope ambiguity
- `Low`: wording, formatting, traceability, or nonmaterial rounding issue

Approve only when:

- the corrected direct-cost model reconciles;
- all material labor is costed or explicitly covered by a reconciled lump sum;
- expected hours fit the target-margin hour limit;
- the technical configuration supports the tender requirement with documented spare capacity;
- material exclusions and change-order triggers are explicit;
- base and stress cases remain within the user's approval policy.
