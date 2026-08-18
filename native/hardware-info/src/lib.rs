//! Hardware introspection addon: sysinfo behind a Neon boundary.
//!
//! The addon compiles on any host with a Rust toolchain; the JS entry gates
//! loading to apple-silicon (darwin-arm64) and linux hosts, where the
//! probe/hardwareInfo surface is meaningful. Unsupported hosts never load
//! this module and report `unsupported` through the probe.

use neon::prelude::*;
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};

/// Whether the native module loaded successfully. Only reachable when the JS
/// entry actually loaded the binary, so it always reports `supported`.
fn probe(mut cx: FunctionContext) -> JsResult<JsString> {
    Ok(cx.string("supported"))
}

/// One synchronous hardware snapshot: system identity, CPU, and memory.
fn hardware_info(mut cx: FunctionContext) -> JsResult<JsObject> {
    let mut sys = System::new();
    sys.refresh_specifics(
        RefreshKind::everything()
            .with_cpu(CpuRefreshKind::everything())
            .with_memory(MemoryRefreshKind::everything()),
    );

    let cpus = sys.cpus();
    let first = cpus.first();

    let system = cx.empty_object();
    set_string(&mut cx, &system, "name", System::name().as_deref())?;
    set_string(&mut cx, &system, "osVersion", System::long_os_version().as_deref())?;
    set_string(&mut cx, &system, "kernelVersion", System::kernel_version().as_deref())?;
    set_string(&mut cx, &system, "hostName", System::host_name().as_deref())?;
    set_string(&mut cx, &system, "cpuArch", Some(System::cpu_arch().as_str()))?;

    let cpu = cx.empty_object();
    set_string(&mut cx, &cpu, "brand", first.map(|cpu| cpu.brand()))?;
    set_string(&mut cx, &cpu, "name", first.map(|cpu| cpu.name()))?;
    set_string(&mut cx, &cpu, "vendorId", first.map(|cpu| cpu.vendor_id()))?;
    let logical_cores = cx.number(cpus.len() as f64);
    cpu.set(&mut cx, "logicalCores", logical_cores)?;
    let physical_cores = cx.number(System::physical_core_count().unwrap_or_default() as f64);
    cpu.set(&mut cx, "physicalCores", physical_cores)?;
    let frequency_mhz = cx.number(first.map_or(0, |cpu| cpu.frequency()) as f64);
    cpu.set(&mut cx, "frequencyMhz", frequency_mhz)?;

    let memory = cx.empty_object();
    let total_bytes = cx.number(sys.total_memory() as f64);
    let available_bytes = cx.number(sys.available_memory() as f64);
    memory.set(&mut cx, "totalBytes", total_bytes)?;
    memory.set(&mut cx, "availableBytes", available_bytes)?;

    let out = cx.empty_object();
    out.set(&mut cx, "system", system)?;
    out.set(&mut cx, "cpu", cpu)?;
    out.set(&mut cx, "memory", memory)?;
    Ok(out)
}

/// Set a string field when the source is present, skipping absent fields.
fn set_string(
    cx: &mut FunctionContext,
    target: &Handle<JsObject>,
    key: &str,
    value: Option<&str>,
) -> NeonResult<()> {
    if let Some(value) = value {
        let rendered = cx.string(value);
        target.set(cx, key, rendered)?;
    }
    Ok(())
}

#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    cx.export_function("probe", probe)?;
    cx.export_function("hardwareInfo", hardware_info)?;
    Ok(())
}