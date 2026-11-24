using System;

class Program
{
    static int Sign(int x)
    {
        if (x > 0) return 1;
        else if (x < 0) return -1;
    }
    static void Main() { Console.WriteLine(Sign(3)); }
}
