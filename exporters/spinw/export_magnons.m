function data = export_magnons(filename, model, qpath, varargin)
%EXPORT_MAGNONS Write SpinW spin-wave modes for magnon.html.
% export_magnons('modes.json', model, {[0 0 0] [1 0 0] 101})
% accepts the same reciprocal-space path convention as model.spinwave.
% Numeric qpath is 3-by-N in SpinW reciprocal lattice units.
%
% Name/value options:
%   Name         Display name (default 'SpinW magnons').
%   Labels       Cell array of labels for vertices of a cell-array qpath.
%   Repetitions  Three integers from 1 to 50 (default [2 2 1]).
%   OmegaTolerance  SpinW's omega_tol, in meV (default 1e-8).
%
% The optional return value is the structure that is written to JSON.
% See README.md for momentum, spin, normalization and magnetic-cell choices.

p = inputParser;
p.addParameter('Name', 'SpinW magnons', @(x) ischar(x) || isstring(x));
p.addParameter('Labels', {}, @iscell);
p.addParameter('Repetitions', [2 2 1], @(x) isnumeric(x) && numel(x)==3 && all(isfinite(x)) && all(x>=1 & x<=50 & x==round(x)));
p.addParameter('OmegaTolerance', 1e-8, @(x) isnumeric(x) && isscalar(x) && isfinite(x) && x>0);
p.parse(varargin{:});
opt = p.Results;
if ~isa(model, 'spinw') || model.symbolic
    error('magnonwebsite:SpinWModel', 'Supply a numerical SpinW model.');
end
if ~strcmp(model.unit.label{2}, 'meV') || ~strcmp(model.unit.label{1}, char(197))
    error('magnonwebsite:Units', 'Use SpinW''s standard angstrom/meV units (setunit mode AmeVTK).');
end
if numel(model.twin.vol) ~= 1 || norm(model.twin.rotc(:,:,1)-eye(3), 'fro') > 1e-10
    error('magnonwebsite:Twins', 'Export one unrotated magnetic domain at a time.');
end
mag = model.magstr;
if ~mag.exact || any(abs(mag.k .* mag.N_ext - round(mag.k .* mag.N_ext)) > 1e-10)
    error('magnonwebsite:Incommensurate', ['An explicit periodic magnetic cell is required. ' ...
        'For rational order, first expand genmagstr nExt to contain its full period.']);
end
moments = model.magtable;
nmag = size(moments.M, 2);
spinlength = sqrt(sum(moments.M.^2, 1));
if nmag == 0 || any(~isfinite(spinlength)) || any(spinlength <= 0)
    error('magnonwebsite:GroundState', 'Define a nonzero, finite ordered spin on every magnetic site.');
end
[q, vertices] = make_path(qpath);
if ~isempty(opt.Labels) && numel(opt.Labels) ~= numel(vertices)
    error('magnonwebsite:Labels', 'Labels must match the vertices of a cell-array qpath.');
end

% V is saved before SpinW's continuity sorting of omega and Sab. Disable
% that sorting and apply the same ascending permutation to omega and V.
spec = model.spinwave(q, 'saveV', true, 'sortMode', false, ...
    'notwin', true, 'hermit', true, 'cmplxBase', false, ...
    'formfact', false, 'gtensor', false, 'omega_tol', opt.OmegaTolerance, ...
    'fid', 0, 'tid', 0);
nq = size(q, 2);
if ~isnumeric(spec.V) || size(spec.V,1)~=2*nmag || size(spec.V,2)~=2*nmag || size(spec.V,3)~=nq
    error('magnonwebsite:SpinWVersion', 'Unexpected SpinW saveV dimensions; the exporter needs the full Bogoliubov matrix.');
end
if size(spec.omega,1) ~= 2*nmag || size(spec.omega,2) ~= nq
    error('magnonwebsite:SpinWVersion', 'Unexpected SpinW energy dimensions.');
end
if any(~isfinite(spec.omega(:))) || any(abs(imag(spec.omega(:))) > 1e-7)
    error('magnonwebsite:UnstableModes', 'Complex or nonfinite energies cannot describe stable spin-wave motion.');
end
zed = moments.e1 + 1i*moments.e2;
energies = cell(1,nq);
vectors = cell(1,nq);
for iq = 1:nq
    V = spec.V(:,:,iq);
    metricNorm = sum(abs(V(1:nmag,:)).^2 - abs(V(nmag+1:end,:)).^2, 1);
    physical = find(metricNorm > 0);
    if numel(physical) ~= nmag || any(abs(metricNorm(physical)-1) > 1e-5)
        error('magnonwebsite:ModeNorm', 'Expected one positive-norm bosonic mode per magnetic site at q index %d.', iq);
    end
    [energy, order] = sort(real(spec.omega(physical,iq)), 'ascend');
    if any(energy < -opt.OmegaTolerance)
        error('magnonwebsite:UnstableModes', 'Negative physical excitation energy at q index %d.', iq);
    end
    physical = physical(order);
    energies{iq} = num2cell(max(energy,0).');
    modes = cell(1,nmag);
    for ib = 1:nmag
        u = V(1:nmag,physical(ib)).';
        v = V(nmag+1:end,physical(ib)).';
        d = bsxfun(@times, bsxfun(@times,conj(zed),u) + bsxfun(@times,zed,v), sqrt(spinlength/2));
        if any(~isfinite(d(:)))
            error('magnonwebsite:ModeNorm', 'Nonfinite mode amplitudes at q index %d.', iq);
        end
        sites = cell(1,nmag);
        for ia = 1:nmag
            sites{ia} = {[real(d(1,ia)) imag(d(1,ia))], ...
                         [real(d(2,ia)) imag(d(2,ia))], ...
                         [real(d(3,ia)) imag(d(3,ia))]};
        end
        modes{ib} = sites;
    end
    vectors{iq} = modes;
end

% Build every structural atom, retaining SpinW's magnetic-site ordering.
atoms = model.atom;
atoms.S = double(atoms.mag);
extended = sw_extendlattice(mag.N_ext, atoms);
magnetic = repmat(atoms.mag,1,prod(mag.N_ext));
indices = find(magnetic);
positions = extended.RRext;
if numel(indices)~=nmag || max(abs(reshape(bsxfun(@times,positions(:,indices),mag.N_ext(:))-moments.R,[],1))) > 1e-8
    error('magnonwebsite:SiteOrder', 'SpinW structural and magnetic site orders do not match.');
end
types = sw_atomdata(double(model.unit_cell.Z(extended.idxext)), 'name');
if ischar(types), types = {types}; end
% SpinW's generic atom is Unobtanium. The viewer uses X for it.
types(strcmp(types,'A') | strcmp(types,'Un')) = {'X'};
lattice = (model.basisvector * diag(mag.N_ext)).';
nativeq = model.unit.qmat * q;
canonicalq = -bsxfun(@times,nativeq,mag.N_ext(:));
qcart = (2*pi*(model.basisvector.'\nativeq)).';
distance = [0; cumsum(sqrt(sum(diff(qcart,1,1).^2,2)))];

data = struct;
data.format = 'magnonwebsite';
data.version = 1;
data.name = char(opt.Name);
data.lattice = lattice;
data.atom_types = reshape(types,1,[]);
data.atom_pos_red = rows(positions.');
data.magnetic_atom_indices = num2cell(indices-1);
data.spin_vectors = rows(moments.M.');
data.qpoints = rows(canonicalq.');
data.energies = energies;
data.vectors = vectors;
data.repetitions = reshape(opt.Repetitions,1,3);
data.distances = num2cell(distance.');
data.highsym_qpts = cell(1,numel(opt.Labels));
for i = 1:numel(opt.Labels)
    data.highsym_qpts{i} = {vertices(i)-1, char(opt.Labels{i})};
end
data.line_breaks = {[0 nq]};
data.units = struct('length','angstrom','energy','meV','spin','hbar');
data.phase_convention = 'cell-periodic';
data.time_convention = 'exp(-iwt)';
sourceVersion = model.version;
versionString = sourceVersion.Version;
if isempty(versionString), versionString = 'unreported by SpinW'; end
data.metadata = struct('source','SpinW', 'source_version',versionString, ...
    'producer','SpinW', 'producer_version',versionString, ...
    'source_release',sourceVersion.Release, ...
    'exporter_version','0.1.0', 'spin_representation','spin expectation values, not magnetic moments', ...
    'normalization','<0|S_i|one magnon>; one quantum per magnetic cell; no per-site rescaling', ...
    'hamiltonian_convention','Native SpinW exchange and classical anisotropy matrices are unchanged', ...
    'input_qpoints',{rows(q.')}, 'input_qmat',model.unit.qmat, ...
    'q_convention','q_export=-diag(nExt)*qmat*q_input; SpinW native Fourier sign reversed for exp(+iq.R-iwt)', ...
    'magnetic_cell_repetitions',mag.N_ext, 'omega_tolerance_meV',opt.OmegaTolerance, ...
    'goldstone_note','SpinW may add omega_tol to a singular Hamiltonian; exact Goldstone amplitudes are not unique');

% Explicit cells above preserve all singleton dimensions in MATLAB JSON.
encoded = jsonencode(data);
[fid,message] = fopen(filename,'w','n','UTF-8');
if fid == -1, error('magnonwebsite:File', 'Cannot write %s: %s', filename, message); end
closer = onCleanup(@() fclose(fid)); %#ok<NASGU>
fprintf(fid,'%s\n',encoded);
end

function value = rows(matrix)
value = cell(1,size(matrix,1));
for row=1:size(matrix,1), value{row} = matrix(row,:); end
end

function [q, vertices] = make_path(input)
vertices = [];
if iscell(input)
    points = input;
    count = 100;
    if ~isempty(points) && isscalar(points{end})
        count = points{end};
        points(end) = [];
    end
    if numel(points)<2 || ~isscalar(count) || ~isfinite(count) || count<2 || count~=round(count) ...
            || any(cellfun(@(x) ~isnumeric(x) || numel(x)~=3 || ~isreal(x) || any(~isfinite(x)),points))
        error('magnonwebsite:QPath', 'Use {[h k l] [h k l] ... N} with N>=2 points per segment.');
    end
    q = sw_qscan([points {count}]);
    vertices = 1+(0:numel(points)-1)*(count-1);
else
    q = input;
end
if ~isnumeric(q) || ~ismatrix(q) || size(q,1)~=3 || isempty(q) || ~isreal(q) || any(~isfinite(q(:)))
    error('magnonwebsite:QPath', 'Numeric qpath must be a finite real 3-by-N array in SpinW reciprocal units.');
end
end
