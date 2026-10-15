function test_export_magnons
%TEST_EXPORT_MAGNONS Physical and JSON tests; requires MATLAB and SpinW.
root = fileparts(fileparts(mfilename('fullpath')));
addpath(root,fullfile(root,'examples'));
directory = tempname;
mkdir(directory);
cleanup = onCleanup(@() rmdir(directory,'s')); %#ok<NASGU>
file = fullfile(directory,'modes.json');
models = magnon_example_models;
q = [0.07 0.19 0.31 0.43; zeros(2,4)];
fm = export_magnons(file,models.fm,q);
energy = cell2mat(cellfun(@cell2mat,fm.energies,'UniformOutput',false).');
assert(max(abs(energy-2*(1-cos(2*pi*q(1,:).')))) < 1e-7, 'FM analytic dispersion');
d = unpack(fm.vectors{1}{1});
assert(abs(sum(abs(d).^2,'all')-1)<1e-10,'One-magnon amplitude for S=1');
assert(norm(imag(cross(conj(d),d,1)) + models.fm.magtable.M, 'fro') < 1e-10,'Physical precession handedness');

afm = export_magnons(file,models.afm,q);
energy = cell2mat(cellfun(@cell2mat,afm.energies,'UniformOutput',false).');
assert(max(abs(energy-2*abs(sin(2*pi*q(1,:).'))),[],'all') < 1e-7,'AFM analytic dispersion');
assert(isequal(afm.lattice(1,:),[6 0 0]),'Magnetic cell doubles a');
assert(max(abs(cell2mat(afm.qpoints.')+2*q.'),[],'all') < 1e-12,'Magnetic-cell q conversion');
assert(isequal(afm.magnetic_atom_indices,{0,1}),'Zero-based atom indices');
assert(norm(cell2mat(afm.spin_vectors.')-[0 1 0;0 -1 0],'fro')<1e-12,'AFM ordered spins');

% Compare the full polarized correlation tensor, including nontrivial
% intracell phases, with SpinW's independently assembled Sab.
check_correlations(file,models.afm,q);
check_correlations(file,models.kagome,[0.17 0.31;0.09 -0.13;0 0]);
check_correlations(file,models.triangular,[0.12 0.23;0.08 0.19;0 0]);

% A nonreciprocal DM chain catches a q-sign error hidden by reciprocal bands.
dm = spinw;
dm.genlattice('lat_const',[8 8 1]);
dm.addatom('r',[0 0 0],'S',1.5,'label','MCr3');
dm.gencoupling('maxDistance',1.1,'fid',0);
dm.addmatrix('label','J','value',[0 0.2 0;-0.2 0 0;0 0 -1]);
dm.addcoupling('mat','J','bond',1);
dm.genmagstr('mode','direct','S',[0;0;1.5]);
result = export_magnons(file,dm,[0 0;0 0;0.25 -0.25]);
physicalq = cell2mat(result.qpoints.');
energy = cell2mat(cellfun(@cell2mat,result.energies,'UniformOutput',false).');
assert(max(abs(energy-3*(1+0.2*sin(2*pi*physicalq(:,3))))) < 1e-7,'Nonreciprocal canonical q');

% Singleton q, mode and atom dimensions must survive JSON serialization.
single = export_magnons(file,models.fm,[0.25;0;0]); %#ok<NASGU>
raw = fileread(file);
assert(contains(raw,'"energies":[['),'Singleton energies remain Q-by-B');
assert(contains(raw,'"qpoints":[['),'Singleton q remains Q-by-3');
assert(contains(raw,'"magnetic_atom_indices":[0]'),'Singleton index remains array');
assert(contains(raw,'"vectors":[[[[['),'Mode, site and coordinate dimensions remain nested');
maximum = export_magnons(file,models.fm,[0.25;0;0],'Repetitions',[50 1 1]);
assert(isequal(maximum.repetitions,[50 1 1]),'Viewer repetition upper bound');
must_error(@() export_magnons(file,models.fm,[0.25;0;0],'Repetitions',[51 1 1]),'MATLAB:InputParser:ArgumentFailedValidation');

% Nonmagnetic atoms remain in the structure and do not acquire arrows.
withligand = copy(models.fm);
withligand.addatom('r',[0.5 0.5 0.5],'S',0,'label','O');
ligand = export_magnons(file,withligand,[0.25;0;0]);
assert(numel(ligand.atom_types)==2 && numel(ligand.spin_vectors)==1,'Nonmagnetic atom mapping');
withligand.addatom('r',[0.5 0.25 0.5],'S',0);
unknown = export_magnons(file,withligand,[0.25;0;0]);
assert(strcmp(unknown.atom_types{3},'X'),'Unknown atom placeholder');

% Path labels and native qmat are retained, without changing input models.
path = export_magnons(file,models.fm,{[0 0 0] [0.5 0 0] [1 0 0] 3},'Labels',{'G','X','G'});
assert(isequal(path.highsym_qpts,{{0,'G'},{2,'X'},{4,'G'}}),'Vertex indices');
assert(numel(path.qpoints)==5,'Segment endpoint deduplication');
scaledq = copy(models.fm);
scaledq.unit.qmat = diag([2 1 1]);
transformed = export_magnons(file,scaledq,[0.125;0;0]);
assert(norm(transformed.qpoints{1}-[-0.25 0 0])<1e-12,'Native qmat transformation');
assert(abs(transformed.energies{1}{1}-2)<1e-8,'qmat affects native eigensolver');
spiral = copy(models.fm);
spiral.genmagstr('mode','helical','k',[0.123 0 0],'n',[0 0 1],'S',[1;0;0]);
must_error(@() export_magnons(file,spiral,[0.1;0;0]),'magnonwebsite:Incommensurate');
must_error(@() export_magnons(file,models.fm,[0.1 0 0]),'magnonwebsite:QPath');
fprintf('SpinW exporter tests passed: analytic FM/AFM, handedness, nonreciprocal DM,\n');
fprintf('AFM/kagome/triangular Sab tensors, cell/site mapping, paths and JSON dimensions.\n');
end

function d = unpack(sites)
d = zeros(3,numel(sites));
for i=1:numel(sites)
    for a=1:3
        pair = sites{i}{a};
        d(a,i) = pair(1)+1i*pair(2);
    end
end
end

function check_correlations(file,model,q)
data = export_magnons(file,model,q);
spec = model.spinwave(q,'saveV',true,'sortMode',false,'notwin',true, ...
    'hermit',true,'omega_tol',1e-8,'fid',0,'tid',0);
mag = model.magstr;
nmag = numel(data.spin_vectors);
for iq=1:size(q,2)
    [~,order] = sort(spec.omega(1:nmag,iq),'ascend');
    for ib=1:nmag
        d = unpack(data.vectors{iq}{ib});
        phase = exp(2*pi*1i*(q(:,iq).'*model.magtable.R));
        F = sum(bsxfun(@times,d,phase),2);
        expected = conj(F)*F.'/prod(mag.N_ext);
        observed = spec.Sab(:,:,order(ib),iq);
        assert(norm(expected-observed,'fro') < 1e-8*max(1,norm(observed,'fro')),'SpinW Sab agreement');
    end
end
end

function must_error(action,id)
try
    action();
catch err
    assert(strcmp(err.identifier,id),'Unexpected error: %s',err.identifier);
    return
end
error('Expected %s',id);
end
