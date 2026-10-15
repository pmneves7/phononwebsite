# This is the only layer that accesses Sunny's internal spin-wave frames.
# Conventions follow Sunny's spin-observable linearization (MIT license).
# See README.md and THIRD_PARTY.md for formulas, source links, and attribution.

function _check_sunny(swt)
    v = Base.pkgversion(Sunny)
    v"0.7.8" <= v < v"0.10" || error("SunnyMagnonExport supports Sunny 0.7.8–0.9.x; found $v. Its internal frame adapter needs validation for this version.")
    sys = swt.sys
    sys.mode in (:dipole, :dipole_uncorrected, :SUN) || error("Unsupported Sunny mode $(sys.mode).")
    sys.dims == (1, 1, 1) || error("Expected Sunny's flattened spin-wave magnetic cell.")
    if hasproperty(sys, :units) && !isnothing(sys.units)
        error("Entangled-unit systems are not supported by this exporter.")
    end
    # In newer Sunny releases the underlying contracted system is explicit.
    if isdefined(Sunny, :uncontracted_system) && Sunny.uncontracted_system(sys) !== sys
        error("Entangled-unit systems are not supported by this exporter.")
    end
    length(sys.dipoles) == length(sys.crystal.positions) || error("Spin/site mismatch; entangled-unit systems are unsupported.")
    if sys.mode == :SUN
        all(==(first(sys.Ns)), sys.Ns) || error("SU(N) export requires a common local Hilbert-space dimension.")
    end
end

# d[:,i,ν] is the coefficient of beta_(q,ν) in S_i(q).
# Both u and v come from the SAME positive-energy eigenvector column.
function _cartesian_modes(swt, T)
    sys, data = swt.sys, swt.data
    na = length(sys.crystal.positions)
    nb = size(T, 2)
    d = zeros(ComplexF64, 3, na, nb)
    if sys.mode == :SUN
        n = first(sys.Ns)
        # Renamed when Sunny unified its entangled-unit implementation.
        ops = hasproperty(data, :spin_ops) ? data.spin_ops : data.spins_localized
        size(ops) == (3, na) || error("Unsupported Sunny SU(N) spin-operator layout.")
        for b in 1:nb
            uv = reshape(view(T, :, b), n-1, na, 2)
            for i in 1:na, a in 1:3, f in 1:n-1
                O = ops[a, i]
                d[a, i, b] += O[n, f] * uv[f, i, 1] + O[f, n] * uv[f, i, 2]
            end
        end
    else
        for b in 1:nb, i in 1:na
            u, v = T[i, b], T[na+i, b]
            local_d = data.sqrtS[i] / sqrt(2) .* [u+v, im*(v-u), 0]
            d[:, i, b] = data.local_rotations[i] * local_d
        end
    end
    return d
end
