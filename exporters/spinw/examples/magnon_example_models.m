function models = magnon_example_models
% Small model definitions corresponding to SpinW tutorials 1, 2, 7 and 12.
% No plotting, optimization, preferences or persistent path changes.

fm = spinw;
fm.genlattice('lat_const',[3 8 8],'angled',[90 90 90]);
fm.addatom('r',[0 0 0],'S',1,'label','MCu1');
fm.gencoupling('maxDistance',7,'fid',0);
fm.addmatrix('label','J','value',-1);
fm.addcoupling('mat','J','bond',1);
fm.genmagstr('mode','direct','k',[0 0 0],'S',[0;1;0]);

afm = copy(fm);
afm.addmatrix('label','J','value',1);
afm.genmagstr('mode','direct','k',[0 0 0], ...
    'nExt',[2 1 1],'S',[0 0;1 -1;0 0]);

kagome = spinw;
kagome.genlattice('lat_const',[6 6 10],'angled',[90 90 120],'sym','P -3');
kagome.addatom('r',[1/2 0 0],'S',1,'label','MCu1');
kagome.gencoupling('maxDistance',7,'fid',0);
kagome.addmatrix('label','J1','value',1);
kagome.addmatrix('label','J2','value',0.11);
kagome.addcoupling('mat','J1','bond',1);
kagome.addcoupling('mat','J2','bond',2);
kagome.genmagstr('mode','direct','k',[0 0 0],'unit','lu', ...
    'S',[1 -2 1;2 -1 -1;0 0 0]);

triangular = spinw;
triangular.genlattice('lat_const',[3 3 4],'angled',[90 90 120]);
triangular.addatom('r',[0 0 0],'S',1.5,'label','MCr3');
triangular.gencoupling('maxDistance',4,'fid',0);
triangular.addmatrix('label','J','value',1);
triangular.addmatrix('label','D','value',diag([0 0 0.2]));
triangular.addcoupling('mat','J','bond',1);
triangular.addaniso('D');
% The tutorial's rational spiral is expanded into an explicit periodic
% 3-by-3 cell. This folds the bands; the physical Hamiltonian is unchanged.
triangular.genmagstr('mode','helical','k',[1/3 1/3 0],'n',[0 0 1], ...
    'S',[0;1;0],'nExt',[3 3 1]);

models = struct;
models.fm = fm;
models.afm = afm;
models.kagome = kagome;
models.triangular = triangular;
end
