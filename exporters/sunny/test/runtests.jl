using Test, Sunny, SunnyMagnonExport, LinearAlgebra, JSON
include("../examples/models.jl")

function decoded_mode(data, iq, b)
    pairs = data["vectors"][iq][b]
    hcat([ComplexF64[complex(p...) for p in site] for site in pairs]...)
end

# Reconstruct a separate native observable from the exported vectors. This
# checks phase interference, local frames, both sectors, and absolute weights.
function check_native_observables(example)
    (; sys, swt, path, units) = example
    data = magnon_data(swt, path; units)
    native = intensities_bands(swt, path)
    # Independently request all Cartesian components from the native public
    # measurement API. Trace-only checks cannot detect conjugated polarization.
    # Rebuild from the original system: Sunny 0.7 stores already-rotated
    # interactions in swt.sys, which must not be rotated a second time.
    tensor_swt = SpinWaveTheory(sys; regularization=swt.regularization,
        measure=ssf_custom((q, ssf) -> ssf, sys; apply_g=false))
    tensors = intensities_bands(tensor_swt, path)
    original = Sunny.orig_crystal(swt.sys)
    ncells = length(swt.sys.crystal.positions) / length(original.positions)
    for (iq, q) in enumerate(path.qs)
        order = sortperm(native.disp[:, iq])
        @test data["energies"][iq] ≈ native.disp[order, iq] ./ units.meV
        qcart = original.recipvecs * q
        # Contract the cell-periodic per-site mode with physical basis phases.
        phase = [cis(-dot(qcart, swt.sys.crystal.latvecs * r)) for r in swt.sys.crystal.positions]
        reconstructed = [sum(abs2, decoded_mode(data, iq, b) * phase) / ncells for b in eachindex(order)]
        amplitudes = [decoded_mode(data, iq, b) * phase for b in eachindex(order)]
        tensor_order = sortperm(tensors.disp[:, iq])
        # Degenerate bases can rotate between eigensolver calls: sum all bands
        # with equal energies before comparing invariant spectral weights.
        unused = trues(length(order))
        for b in eachindex(order)
            unused[b] || continue
            group = findall(j -> isapprox(data["energies"][iq][j], data["energies"][iq][b]; atol=1e-7, rtol=1e-7), eachindex(order))
            unused[group] .= false
            @test isapprox(sum(reconstructed[group]), sum(native.data[order[group], iq]); rtol=1e-6, atol=1e-7)
            expected_tensor = sum(amplitudes[j] * amplitudes[j]' for j in group) / ncells
            @test isapprox(expected_tensor, sum(tensors.data[tensor_order[group], iq]); rtol=1e-6, atol=1e-7)
        end
        Bexport = 2π * inv(hcat(data["lattice"]...))'
        @test Bexport * data["qpoints"][iq] ≈ qcart .* units.angstrom
    end
    @test all(isfinite, reduce(vcat, data["energies"]))
    return data
end

@testset "Sunny exporter physics and JSON" begin
    @testset "FM analytic dispersion and handedness" begin
        e = chain_example(; samples=11)
        data = check_native_observables(e)
        for (iq, q) in enumerate(e.path.qs)
            @test data["energies"][iq][1] ≈ 2*(1-cos(2π*q[1])) + e.swt.regularization atol=1e-10
            d = decoded_mode(data, iq, 1)[:, 1]
            @test sum(abs2, d) ≈ 1
            @test abs(d[3]) < 1e-12
            @test imag(conj(d[1])*d[2]) ≈ -1/2
        end
        mktemp() do file, io
            close(io)
            export_magnons(file, e.swt, e.path; name="Unicode Γ FeI₂")
            parsed = JSON.parsefile(file)
            @test parsed["name"] == "Unicode Γ FeI₂"
            @test parsed["magnetic_atom_indices"] == [0]
            @test length(parsed["vectors"][1][1][1][1]) == 2
        end
    end
    @testset "AFM magnetic cell and anomalous sector" begin
        e = chain_example(; afm=true, samples=11)
        data = check_native_observables(e)
        @test length(data["spin_vectors"]) == 2
        @test data["lattice"][1] ≈ [6, 0, 0]
        @test data["qpoints"][end] ≈ [2, 0, 0]
        for (iq, q) in enumerate(e.path.qs)
            expected = sqrt((2+e.swt.regularization)^2 - (2*cos(2π*q[1]))^2)
            @test all(isapprox.(data["energies"][iq], expected; atol=1e-7))
        end
    end
    @testset "CoRh₂O₄ primitive cell" begin
        e = corh2o4_example(; samples=13)
        data = check_native_observables(e)
        @test length(data["spin_vectors"]) == 2
        @test all(s -> isapprox(norm(s), 3/2), data["spin_vectors"])
        for (iq, q) in enumerate(e.path.qs)
            displacements = [[1,1,1], [1,-1,-1], [-1,1,-1], [-1,-1,1]] ./ 4
            gamma = sum(cis(2π*dot(q, delta)) for delta in displacements) / 4
            expected = 3.78 * sqrt(max(0, 1-abs2(gamma)))
            expected > 1e-6 && @test all(isapprox.(data["energies"][iq], expected; atol=1e-6))
        end
    end
    @testset "SU(3) pure quadrupolar mode remains present and dark" begin
        cryst = Crystal(lattice_vectors(3, 7, 8, 90, 90, 90), [[0,0,0]], "P1")
        sys = System(cryst, [1 => Moment(s=1, g=2)], :SUN)
        set_onsite_coupling!(sys, S -> -2*S[3]^2, 1)
        set_field!(sys, [0,0,-0.25/2])
        set_dipole!(sys, [0,0,1], (1,1,1,1))
        swt = SpinWaveTheory(sys; measure=ssf_trace(sys; apply_g=false))
        path = q_space_path(cryst, [[0,0,0],[0.25,0,0]], 3)
        data = check_native_observables((; sys, swt, path, units=Units(:meV,:angstrom)))
        @test data["energies"][1] ≈ [0.5, 2.25] atol=1e-7
        @test norm(decoded_mode(data, 1, 1)) < 1e-12
        @test norm(decoded_mode(data, 1, 2)) ≈ 1
    end
    @testset "Asymmetric DM chain preserves native q sign" begin
        cryst = Crystal(lattice_vectors(1,1,1,90,90,90), [[0,0,0]], "P1")
        sys = System(cryst, [1 => Moment(s=3/2,g=2)], :dipole)
        z = [0,0,1]
        set_exchange!(sys, dmvec(0.2*z) - z*z', Bond(1,1,[0,0,1]))
        polarize_spins!(sys, z)
        swt = SpinWaveTheory(sys; measure=ssf_trace(sys; apply_g=false))
        path = q_space_path(cryst, [[0,0,-1/4],[0,0,1/4]], 3)
        data = check_native_observables((; sys, swt, path, units=Units(:meV,:angstrom)))
        @test only(data["energies"][1]) ≈ 2.4 atol=1e-7
        @test only(data["energies"][3]) ≈ 3.6 atol=1e-7
        @test data["qpoints"][1] ≈ [0,0,-1/4]
    end
    @testset "Classical anisotropy ellipticity" begin
        cryst = Crystal(lattice_vectors(3,7,8,90,90,90), [[0,0,0]], "P1")
        sys = System(cryst, [1 => Moment(s=1,g=2)], :dipole_uncorrected)
        set_onsite_coupling!(sys, S -> -2*S[3]^2 + 0.5*S[1]^2, 1)
        polarize_spins!(sys, [0,0,1])
        swt = SpinWaveTheory(sys; measure=ssf_trace(sys; apply_g=false))
        path = q_space_path(cryst, [[0,0,0],[1/4,0,0]], 3)
        data = check_native_observables((; sys, swt, path, units=Units(:meV,:angstrom)))
        @test only(data["energies"][1]) ≈ sqrt(4*5) atol=1e-7
        d = decoded_mode(data, 1, 1)[:,1]
        @test abs(d[2]/d[1]) ≈ sqrt(5/4) atol=1e-7
    end
    @testset "Ewald long-range dipoles and kelvin conversion" begin
        e = dipole_example(; samples=13)
        data = check_native_observables(e)
        @test data["metadata"]["long_range_dipoles"]
        @test data["metadata"]["input_energy_unit"] == "K"
        @test length(data["energies"][1]) == 4
        @test data["units"]["energy"] == "meV"
    end
    @testset "FeI₂ SU(3) full operator matrix elements" begin
        e = fei2_example(; samples=13)
        data = check_native_observables(e)
        @test length(data["spin_vectors"]) == 4
        @test length(data["energies"][1]) == 8
        @test data["metadata"]["sunny_mode"] == "SUN"
        # SU(3) dipole fluctuations need not be transverse to equilibrium S.
        longitudinal = [abs(dot(data["spin_vectors"][i], decoded_mode(data, iq, b)[:, i]))
                        for iq in eachindex(data["qpoints"]), b in 1:8, i in 1:4]
        @test maximum(longitudinal) > 1e-5
    end
    @testset "Reject unsupported calculators and malformed paths" begin
        e = chain_example(; samples=3)
        @test_throws ArgumentError magnon_data(nothing, e.path)
        @test_throws ArgumentError magnon_data(e.swt, [])
        @test_throws ArgumentError magnon_data(e.swt, [[NaN,0,0]])
        @test_throws ArgumentError magnon_data(e.swt, e.path; repetitions=(0,1,1))
        @test_throws ArgumentError magnon_data(e.swt, e.path; repetitions=(51,1,1))
        @test_throws ArgumentError magnon_data(e.swt, e.path; repetitions=(true,1,1))
        @test magnon_data(e.swt, e.path; repetitions=(50,1,1))["repetitions"] == [50,1,1]
    end
end
