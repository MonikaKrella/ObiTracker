We finished MVP phase. Now we need to proceed with V2 phase, as there are still important features to add.
1.Password reset / forgot-password flow - now users are able to sign up and sign in but when they forget the password there is no option to reset password. We can do it by sending reset password link to the reset password page, where user sets new password (user needs to write it twice to be sure what is written + let's add option to hide and display written password - hidden as default (as it is now when setting password))

2.Competition results page (scores, rankings, averages):
- competition results page should be per dog 
- we have 3 classes : Class 1, Class 2, Class 3
- on the competition results page, user should have dropdown to select class to display + option to mark class as default - to be able to see fastly results from the class where user=handler actually competes. Default class should be visible when user visits this page. If user doesn't mark an class a default, then class 1 should be displayed.
- classes are stable/permanent - they are not user specific. Each class have it's specific exercises - all of them are written in rules, so not user specific
- exercises for each class should be stored in DB, each exercise has specific multiplier, which we also need to store
- exercises for each class:
CLASS 1 Exercise - multiplier - shortcut
1. Sitting in a group - 3 - Group
2. Heelwork - 4 - Heelwork
3. Position under march - 3 - In march
4. Recall - 4 - Recall
5. Square - 4 - Box
6. Distance control - 4 - Dist.contr.
7. Retrieve and jumping over a hurdle - 4 - Retrieve
8. Go around cones - 4 - Cones
9. General impression - 2 - Impression

CLASS 2 Exercise - multiplier - shortcut
1. Lying in a group - 3 - Group
2. Heelwork - 4 - Heelwork
3. Positions under march - 3 - In march
4. Recall with stop- 3 - Recall
5. Square - 4 - Box
6. Directed retrieve - 3 - Dir.Retrieve
7. Scent discrimination - 3 - Scent
8. Distance control - 4 - Dist.contr.
9. Send around cones, stop and jump - 3 - 3.8
10. General impression - 2 - Impression

CLASS 3 Exercise - multiplier - shortcut
1. Sitting in a group - 2 - Group-sit
2. Lying in a group and recall - 2 - Group-down
3. Heelwork - 4 - Heelwork
4. Positions under march - 3 - In march
5. Recall - 3 - Recall
6. Square - 4 - Box
7. Directed retrieve - 3 - Dir.Retreive
8. Send around cones, stop, retrieve and jump - 4 - 3.8
9. Scent discrimination - 3 - Scent
10. Distance control - 4 - Dist.contr.

- results should be displayed as grid, first column should contain exercises names, second column - exercises multipliers, then next columns will be for competition results. Headers for columns with results should be competition dates. In the cells user must be able to put raw points (from 0 - 10, also it is possible to get 5,5 points, or 7,25 points). Last row should be for tags, in the first column value will be "Tags", column with multiplier empty, and then cell in this column user can add tags by clicking on the cell, short ones like "qualifications", "championships", etc - when writen we will trunkate them an display as tooltips on hoover. Last column should have counted averages from all competitions for current exercise (average from pure points, not from muliplied points). For example exercise heelwork has muliplier 4. User writes pure values, so for example: 10, 8, 6 for this exercise from 3 diffeent competitions. In the average columns the value is 8 ((10+8+6)/3)
- I want to have here highlighting algorithm too, but this one should work differently 
    - take average from all results  (let's give the user options - calculate from all in the class, from last year, from last 6 months) 
    - lets highlight two highest points in green, and two lowest in red
    - if all points are the same - do not highlight anything
    - if there is more than 1 highest result or more than 1 lowest - then highlight all exercises with that points, no matter how many there is

3. Rename dog option

4. TrainingBoard aggregate refactor (highlight classification as a guarded domain object) - as proposed in context/domain/02-invariant-aggregate-refactor.md

5. Add new option to training elements - user is able to attach training element to one of exercises from any class. Many training elements can be attached to the same exercise. On the grid there should be then one new column on the left, before elements name, this column should be possible to be hidden / very short -> to not take space on phone screen for example. Each exercise should have its own specific color, so it is easy to see what is connect to what. We should add new column to the DB table with exercises names and multipliers - column should be named "Shortcut" to display shorter name in the grid