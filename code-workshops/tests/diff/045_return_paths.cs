using System;

class Program
{
    static int Sign(int x)
    {
        if (x > 0) return 1;
        else if (x < 0) return -1;
        else return 0;
    }

    static int Loop()
    {
        while (true) { return 7; }
    }

    static void Early(int x)
    {
        if (x > 0) { Console.WriteLine("pos"); return; }
        Console.WriteLine("not pos");
    }

    static string Name(int x)
    {
        if (x == 1) return "one";
        return "many";
    }

    static void Main()
    {
        Console.WriteLine(Sign(-9) + Sign(0) + Sign(4));
        Console.WriteLine(Loop());
        Early(1); Early(-1);
        Console.WriteLine(Name(1) + Name(2));
    }
}
