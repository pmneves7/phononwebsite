module SunnyMagnonExport

using Sunny, LinearAlgebra, JSON

export export_magnons, magnon_data

include("sunny_adapter.jl")

"""
    magnon_data(swt, path; name="Sunny magnons", units=Units(:meV, :angstrom),
                repetitions=(2, 2, 2), atom_types=nothing, metadata=Dict())

Build magnonwebsite v1 data from an energy-minimized Sunny `SpinWaveTheory`.
`path` is a Sunny `QPath` or a vector of q vectors in the ORIGINAL crystal's
reciprocal lattice units, exactly as accepted by `Sunny.excitations`.
Set `units` to the units used to define the model; output is always Å and meV.
Returns an ordinary dictionary. Does not modify the model or normalize modes.
"""
function magnon_data(swt::Sunny.SpinWaveTheory, path;
                     name="Sunny magnons", units=Sunny.Units(:meV, :angstrom),
                     repetitions=(2, 2, 2), atom_types=nothing, source_url=nothing, metadata=Dict())
    _check_sunny(swt)
    qs = hasproperty(path, :qs) ? collect(path.qs) : collect(path)
    ndims(qs) == 1 && !isempty(qs) || throw(ArgumentError("Provide a nonempty QPath or vector of q vectors."))
    all(q -> length(q) == 3 && all(isfinite, q), qs) || throw(ArgumentError("Each q must contain three finite coordinates."))
    length(repetitions) == 3 && all(n -> n isa Integer && !(n isa Bool) && 1 <= n <= 50, repetitions) ||
        throw(ArgumentError("repetitions must contain three integers from 1 to 50."))
    sys = swt.sys
    cryst = sys.crystal
    original = Sunny.orig_crystal(sys)
    na = length(cryst.positions)
    types = isnothing(atom_types) ? String.(cryst.types) : String.(atom_types)
    length(types) == na || throw(ArgumentError("atom_types must have one label per exported magnetic site ($na)."))
    # Sunny allows unnamed idealized sites. X is a neutral unknown-atom label.
    types = [isempty(t) ? "X" : t for t in types]
    energies = Vector{Float64}[]
    vectors = []
    q_export = []
    for q in qs
        es, T = Sunny.excitations(swt, q)
        nb = size(T, 2) ÷ 2
        # Positive-energy columns describe q; the remaining columns describe -q.
        # Sort energies and their modes together. No band tracking is implied.
        order = sortperm(es[1:nb])
        push!(energies, collect(es[order] ./ units.meV))
        ds = _cartesian_modes(swt, T[:, order])
        all(isfinite, es[order]) && all(isfinite, ds) || error("Nonfinite mode at q=$q; check the ground state and regularization.")
        push!(vectors, [[[[real(ds[a, i, b]), imag(ds[a, i, b])] for a in 1:3] for i in 1:na] for b in 1:nb])
        push!(q_export, collect(cryst.recipvecs \ (original.recipvecs * q)))
    end
    distances = [0.0; cumsum([norm(original.recipvecs * (qs[i] - qs[i-1])) * units.angstrom for i in 2:length(qs)])]
    conventions = Dict(
        "source" => "Sunny", "source_version" => string(Base.pkgversion(Sunny)),
        "producer" => "Sunny", "producer_version" => string(Base.pkgversion(Sunny)),
        "exporter" => "SunnyMagnonExport", "exporter_version" => "0.1.0",
        "sunny_mode" => string(sys.mode),
        "regularization_meV" => swt.regularization / units.meV,
        "input_energy_unit" => string(units.energy), "input_length_unit" => string(units.length),
        "input_q_basis" => "original crystal reciprocal lattice",
        "input_lattice" => [collect(original.latvecs[:, i] ./ units.angstrom) for i in 1:3],
        "input_qpoints" => [collect(q) for q in qs],
        "normalization" => "<0|S_i|q,nu>, unit positive bosonic metric; no per-site normalization",
        "observable" => "spin expectation in hbar; not -mu_B*g*S magnetic moment",
        "spin_motion" => "linear expectation; SU(N) longitudinal changes retained",
        "anisotropy" => "unchanged from Sunny model, including its mode-dependent operator renormalization",
        "basis_phase" => "Sunny modes already use cell-periodic gauge; no extra site phase applied",
        "band_order" => "ascending energy independently at each q; degenerate eigenvectors are not unique",
        "long_range_dipoles" => hasproperty(sys, :ewald) && !isnothing(sys.ewald),
    )
    # Keep user annotations distinct so they cannot overwrite actual conventions.
    !isempty(metadata) && (conventions["user"] = metadata)
    !isnothing(source_url) && (conventions["source_url"] = String(source_url))
    result = Dict{String,Any}(
        "format" => "magnonwebsite", "version" => 1, "name" => String(name),
        "lattice" => [collect(cryst.latvecs[:, i] ./ units.angstrom) for i in 1:3],
        "atom_types" => types, "atom_pos_red" => [collect(r) for r in cryst.positions],
        "magnetic_atom_indices" => collect(0:na-1),
        "spin_vectors" => [collect(s) for s in vec(sys.dipoles)],
        "qpoints" => q_export, "energies" => energies, "vectors" => vectors,
        "distances" => distances, "repetitions" => collect(repetitions),
        "units" => Dict("length" => "angstrom", "energy" => "meV", "spin" => "hbar"),
        "phase_convention" => "cell-periodic", "time_convention" => "exp(-iwt)",
        "metadata" => conventions,
    )
    if hasproperty(path, :xticks)
        result["highsym_qpts"] = [[i-1, label] for (i, label) in zip(path.xticks...)]
    end
    return result
end

function magnon_data(swt, path; kwargs...)
    throw(ArgumentError("Supported input is Sunny.SpinWaveTheory for a periodic dipole or SU(N) system. Spiral, KPM, and entangled-unit calculators are not supported; use a commensurate explicit magnetic cell when appropriate."))
end

"""
    export_magnons(filename, swt, path; kwargs...)

Write a magnonwebsite JSON file. Keywords are the same as `magnon_data`.
Returns the absolute filename. Loading or exporting requires no plotting backend.
"""
function export_magnons(filename::AbstractString, swt, path; kwargs...)
    data = magnon_data(swt, path; kwargs...)
    open(filename, "w") do io
        JSON.print(io, data)
        println(io)
    end
    return abspath(filename)
end

end
