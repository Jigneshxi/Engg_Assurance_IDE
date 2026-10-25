1) Standalone Performance Agent Returning Mock Data

---Expected:
The Performance Agent (#17) should generate a dynamic performance_config based on the user input, including load scenarios (ramp-up, steady state, spike, endurance), thresholds, and script reference.

=---Actual:
The system returns a static telemetry response (e.g., fixed latency, TPS, and “No bottlenecks detected”), which is not derived from the provided input.


2) Run Performance Audit Not Executing

----Expected:
Clicking Run Performance Audit should:
Trigger backend API
Invoke Performance Agent (#17)
Generate load test script (k6/JMeter)
Execute the script
Return real performance metrics

----Actual:
Clicking the button produces no action:
No API call
No execution
No telemetry update



3) Load Profile Graph Not Updating

----Expected:
Selecting load profiles (Steady State, Step Load, Spike Test, Soak/Endurance) should dynamically update the graph to reflect the corresponding load pattern.

----Actual:
The graph remains static regardless of selection:
No visual change
No re-rendering
No linkage to dropdown state


4) Virtual Users Slider Not Functional

----Expected:
Adjusting the Virtual Users slider should:
Update the displayed value
Modify load configuration (VU count)
Dynamically update the graph

----Actual:
The slider is non-functional:
Value does not update
No impact on graph
No effect on generated configuration


5) Import SLOs Not Working

----Expected:
Clicking Import SLOs should:
Fetch SLO definitions from a configured source (API/config/Prometheus)
Populate the NFR Guardrails table with values such as latency, throughput, and error rate

----Actual:
No data is loaded:
No API call triggered
Table remains unchanged

6) No Real Performance Metrics or Insights Generated

----Expected:
The system should provide:
Real latency (p95/p99)
Throughput values
Error rates
Bottleneck identification
Actionable performance recommendations

----Actual:
Output lacks meaningful insights:
Metrics are static or unrealistic
No bottleneck detection
No optimization recommendations


7) Agent Routing and Context Awareness Missing

----Expected:
The system should:
Analyze input type
Trigger only relevant agents
Produce context-aware outputs

----Actual:
The system:
Executes multiple agents regardless of input
Ignores input context
Produces unrelated results


8) UI Not Reflecting Execution State

----Expected:
After execution:
Telemetry panel should display real outputs
Graphs should update dynamically
Metrics should be visible in UI

----Actual:
UI remains in placeholder state:
“Awaiting data”
Static telemetry
No real-time updates