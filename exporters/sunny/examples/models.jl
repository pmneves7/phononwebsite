# Compact, headless adaptations of Sunny's official tutorials (MIT licensed).
# Sources and retained conventions are listed in README.md and THIRD_PARTY.md.
using Sunny, LinearAlgebra

function chain_example(; afm=false, samples=81)
    cryst = Crystal(lattice_vectors(3, 8, 8, 90, 90, 90), [[0, 0, 0]]; types=["Cu"])
    sys = System(cryst, [1 => Moment(s=1, g=2)], :dipole; dims=afm ? (2, 1, 1) : (1, 1, 1))
    set_exchange!(sys, afm ? 1 : -1, Bond(1, 1, [1, 0, 0]))
    # Exact ground states avoid arbitrary optimizer rotations for these fixtures.
    for site in eachsite(sys)
        set_dipole!(sys, [0, 0, afm && site[1] == 2 ? -1 : 1], site)
    end
    path = q_space_path(cryst, [[0, 0, 0], [1/2, 0, 0], [1, 0, 0]], samples; labels=["Γ", "X", "Γ"])
    swt = SpinWaveTheory(sys; measure=ssf_trace(sys; apply_g=false))
    return (; swt, path, units=Units(:meV, :angstrom), repetitions=(8, 1, 1),
            name=afm ? "Sunny · SW02 antiferromagnetic chain" : "Sunny · SW01 ferromagnetic chain",
            source_url="https://sunnysuite.github.io/Sunny.jl/stable/examples/spinw/" * (afm ? "SW02_AFM_Heisenberg_chain.html" : "SW01_FM_Heisenberg_chain.html"))
end

function corh2o4_example(; samples=81)
    a = 8.5031
    cryst = Crystal(lattice_vectors(a, a, a, 90, 90, 90), [[1/8, 1/8, 1/8]], 227; types=["Co"])
    sys = System(cryst, [1 => Moment(s=3/2, g=2)], :dipole; seed=2)
    set_exchange!(sys, 0.63, Bond(2, 3, [0, 0, 0]))
    randomize_spins!(sys)
    minimize_energy!(sys)
    sys = reshape_supercell(sys, primitive_cell(cryst))
    @assert isapprox(energy_per_site(sys), -2 * 0.63 * (3/2)^2; atol=1e-8)
    path = q_space_path(cryst, [[0,0,0], [1/2,0,0], [1/2,1/2,0], [0,0,0]], samples;
                        labels=["Γ", "(½,0,0)", "(½,½,0)", "Γ"])
    swt = SpinWaveTheory(sys; measure=ssf_trace(sys; apply_g=false))
    return (; swt, path, units=Units(:meV, :angstrom), repetitions=(2, 2, 2), name="Sunny · CoRh₂O₄",
            source_url="https://sunnysuite.github.io/Sunny.jl/stable/examples/01_LSWT_CoRh2O4.html")
end

function dipole_example(; samples=101)
    units = Units(:K, :angstrom)
    cryst = Crystal(lattice_vectors(10.19, 10.19, 10.19, 90, 90, 90), [[0,0,0]], 227; types=["Gd"])
    sys = System(cryst, [1 => Moment(s=7/2, g=2)], :dipole; seed=0)
    sys = reshape_supercell(sys, primitive_cell(cryst))
    set_exchange!(sys, 0.304, Bond(1, 2, [0, 0, 0]))
    enable_dipole_dipole!(sys, units.vacuum_permeability)
    randomize_spins!(sys)
    minimize_energy!(sys)
    qs = [[0,0,0], [0,1,0], [1,1/2,0], [1/2,1/2,1/2], [3/4,3/4,0], [0,0,0]]
    path = q_space_path(cryst, qs, samples; labels=["Γ", "X", "W", "L", "K", "Γ"])
    swt = SpinWaveTheory(sys; measure=ssf_trace(sys; apply_g=false))
    return (; swt, path, units, repetitions=(2, 2, 2), name="Sunny · long-range dipoles (Ewald)",
            source_url="https://sunnysuite.github.io/Sunny.jl/stable/examples/07_Dipole_Dipole.html")
end

function fei2_example(; samples=101)
    latvecs = lattice_vectors(4.05012, 4.05012, 6.75214, 90, 90, 120)
    cryst = Crystal(latvecs, [[0,0,0], [1/3,2/3,1/4], [2/3,1/3,3/4]]; types=["Fe", "I", "I"])
    cryst = subcrystal(cryst, "Fe")
    sys = System(cryst, [1 => Moment(s=1, g=2)], :SUN; seed=2)
    set_exchange!(sys, [-0.397 0 0; 0 -0.075 -0.261; 0 -0.261 -0.236], Bond(1,1,[1,0,0]))
    for (pm, zz, n) in [(0.026,0.113,[1,2,0]), (0.166,0.211,[2,0,0]),
                         (0.037,-0.036,[0,0,1]), (0.013,0.051,[1,0,1]), (0.068,0.073,[1,2,1])]
        set_exchange!(sys, diagm([pm, pm, zz]), Bond(1,1,n))
    end
    set_onsite_coupling!(sys, S -> -2.165*S[3]^2, 1)
    # The current tutorial's four-site commensurate magnetic cell. Skip its
    # exploratory 4³ cell: that search is pedagogical, not needed for export.
    sys = reshape_supercell(sys, [1 0 0; 0 1 -2; 0 1 2])
    # Seed the known two-up/two-down state; SU(3) optimization still relaxes the
    # full coherent state, including quadrupoles and canting.
    for site in eachsite(sys)
        r = Sunny.global_position(sys, site)
        q = cryst.recipvecs * [0, -1/4, 1/4]
        direction = cos(dot(q, r) - π/4) >= 0 ? 1 : -1
        set_dipole!(sys, [0,0,direction], site)
    end
    minimize_energy!(sys)
    path = q_space_path(cryst, [[0,0,0], [1,0,0], [0,1,0], [1/2,0,0], [0,1,0], [0,0,0]], samples)
    swt = SpinWaveTheory(sys; measure=ssf_trace(sys; apply_g=false))
    return (; swt, path, units=Units(:meV, :angstrom), repetitions=(3, 2, 1), name="Sunny · FeI₂ SU(3)",
            source_url="https://sunnysuite.github.io/Sunny.jl/stable/examples/03_LSWT_SU3_FeI2.html")
end

function tutorial_examples(; samples=81)
    return ["sunny-sw01" => chain_example(; samples),
            "sunny-sw02" => chain_example(; afm=true, samples),
            "sunny-corh2o4" => corh2o4_example(; samples),
            "sunny-dipole" => dipole_example(; samples),
            "sunny-fei2" => fei2_example(; samples)]
end
